-- Tether, Phase 4: automatic rules (evaluate-session Edge Function) support.
--
-- Data-model change (approved): session_members.rule_state jsonb holds the
-- per-member timers the rules need between runs, e.g.
--   { "in_pin": true, "left_venue_at": "...", "sep_since": "...",
--     "alone_since": "...", "battery_warned": true, ... }
-- It's wiped together with location data when the night ends.
--
-- Also:
--   * one open check-in per member per reason (dedupe for concurrent runs)
--   * last_updated means "location freshness" only, rule bookkeeping writes
--     no longer bump it
--   * respond_check_in() RPC for "Are you okay?" answers
--   * end_session() / escalate_alerts() usable by the service role (cron)
--   * pg_cron job that calls the Edge Function every 10 s via pg_net

alter table public.session_members
  add column if not exists rule_state jsonb not null default '{}'::jsonb;

create unique index if not exists check_ins_one_open_per_member_reason
  on public.check_ins (member_id, reason)
  where responded_at is null;

-- ============================================================================
-- last_updated = when location/battery last changed (or the client says it
-- re-confirmed its position). Status/rule_state writes leave it alone.
-- ============================================================================

create or replace function public.touch_last_updated()
returns trigger
language plpgsql
as $$
begin
  if (new.lat, new.lng, new.battery_level) is distinct from (old.lat, old.lng, old.battery_level) then
    new.last_updated := now();
  end if;
  -- Otherwise keep whatever the update set (a client heartbeat sets it to
  -- now() explicitly; server bookkeeping leaves it unchanged).
  return new;
end;
$$;

-- ============================================================================
-- end_session: now also callable by the service role, and also clears rule
-- timers, open alerts, and open check-ins.
-- ============================================================================

create or replace function public.end_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_session_member(p_session_id) then
    raise exception 'not a member of this session';
  end if;

  update public.sessions set status = 'ended' where id = p_session_id;

  delete from public.session_members where session_id = p_session_id and is_simulated;

  update public.session_members
    set lat = null, lng = null, battery_level = null, rule_state = '{}'::jsonb
    where session_id = p_session_id;

  update public.alerts set resolved = true where session_id = p_session_id and not resolved;
  update public.check_ins set responded_at = now(), response = 'session_ended'
    where session_id = p_session_id and responded_at is null;
end;
$$;

grant execute on function public.end_session(uuid) to authenticated, service_role;

-- ============================================================================
-- escalate_alerts: same ladder as Phase 3, but battery and fake_call alerts
-- are targeted FYIs to one friend, never widened or escalated.
-- ============================================================================

create or replace function public.escalate_alerts(
  p_session_id uuid,
  p_demo_speed float8 default 1,
  p_base_url text default ''
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.alerts;
  speed float8 := greatest(coalesce(p_demo_speed, 1), 0.01);
  everyone uuid[];
  changed int := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_session_member(p_session_id) then
    raise exception 'not a member of this session';
  end if;

  for a in
    select * from public.alerts
    where session_id = p_session_id and not resolved
      and type not in ('battery', 'fake_call')
    for update skip locked
  loop
    if a.level = 'ping' and a.claimed_by is null
       and now() - a.created_at > interval '2 minutes' / speed then
      everyone := public._all_targets(a.member_id);
      if not (everyone <@ a.target_user_ids) then
        update public.alerts set target_user_ids = everyone where id = a.id;
        changed := changed + 1;
      end if;
    end if;

    if now() - coalesce(a.escalated_at, a.created_at) > interval '10 minutes' / speed then
      if a.level = 'ping' then
        perform public._apply_level(a.id, 'alert', p_base_url);
        changed := changed + 1;
      elsif a.level = 'alert' then
        update public.alerts set escalated_at = now() where id = a.id;
        raise log 'tether sms (disabled) re-notify guardian for alert %: %', a.id, a.message;
        changed := changed + 1;
      end if;
    end if;
  end loop;

  return changed;
end;
$$;

grant execute on function public.escalate_alerts(uuid, float8, text) to authenticated, service_role;
grant execute on function public._apply_level(uuid, text, text) to service_role;

-- ============================================================================
-- Check-in answers
-- ============================================================================

-- Responses: 'ok' | 'heading_home' | 'elsewhere' | 'home' | 'help'.
-- Any member may answer (the demo panel answers for simulated friends).
-- Answering closes the matching automatic alert.
create or replace function public.respond_check_in(
  p_check_in_id uuid,
  p_response text,
  p_base_url text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.check_ins;
begin
  if p_response not in ('ok', 'heading_home', 'elsewhere', 'home', 'help') then
    raise exception 'unknown response %', p_response;
  end if;

  select * into c from public.check_ins where id = p_check_in_id;
  if c.id is null or not public.is_session_member(c.session_id) then
    raise exception 'not a member of this session';
  end if;

  update public.check_ins set responded_at = now(), response = p_response
    where id = c.id and responded_at is null;

  update public.alerts set resolved = true
    where member_id = c.member_id and type = c.reason and not resolved;

  case p_response
    when 'ok' then
      update public.session_members
        set status = 'together', status_note = 'Said they’re OK',
            rule_state = rule_state || '{"sep_acked": true}'::jsonb
        where id = c.member_id;
    when 'heading_home' then
      -- eta is filled in by evaluate-session from distance to home.
      update public.session_members
        set status = 'heading_home', status_note = 'Heading home', eta = null, leaving_with = '{solo}'
        where id = c.member_id;
    when 'elsewhere' then
      update public.session_members
        set status = 'separated', status_note = 'Going somewhere else', leaving_with = '{solo}'
        where id = c.member_id;
    when 'home' then
      update public.session_members
        set status = 'home', status_note = 'Home', eta = null
        where id = c.member_id;
    when 'help' then
      perform public.raise_alert(c.member_id, 'ping', 'manual', 'I need help', p_base_url);
  end case;
end;
$$;

grant execute on function public.respond_check_in(uuid, text, text) to authenticated;

-- ============================================================================
-- pg_cron -> evaluate-session every 10 s
-- ============================================================================
-- Needs two Vault secrets (see README "Phase 4 setup"):
--   tether_project_url  e.g. https://abcd1234.supabase.co   (you add this)
--   tether_cron_secret  random, created below; copy it into the function's
--                       CRON_SECRET secret
-- Until tether_project_url exists, the tick is a no-op.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'tether_cron_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(24), 'hex'),
      'tether_cron_secret',
      'Shared secret pg_cron sends to the evaluate-session Edge Function'
    );
  end if;
end;
$$;

create or replace function public._tether_cron_tick()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  base text;
  secret text;
begin
  -- Nothing to do when no night out is running.
  if not exists (select 1 from public.sessions where status = 'active') then
    return;
  end if;
  select decrypted_secret into base from vault.decrypted_secrets where name = 'tether_project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'tether_cron_secret';
  if base is null or secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(base, '/') || '/functions/v1/evaluate-session',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 8000
  );
end;
$$;

revoke all on function public._tether_cron_tick() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'tether-evaluate-sessions') then
    perform cron.unschedule('tether-evaluate-sessions');
  end if;
  perform cron.schedule('tether-evaluate-sessions', '10 seconds', 'select public._tether_cron_tick()');
end;
$$;
