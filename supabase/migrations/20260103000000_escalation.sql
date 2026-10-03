-- Tether, Phase 3: manual escalation ladder, "I'm on it", guardian view.
-- No data-model changes: functions only, plus a Vault secret for signing
-- guardian links.
--
-- Ladder (CLAUDE.md "ESCALATION LADDER"):
--   ping      -> friends. Group <= 5: everyone. > 5: members within 200 ft
--                first, widened to the whole group if none nearby or nobody
--                claims within 2 min.
--   alert     -> the member's guardian (SMS text + /guardian/:token link),
--                naming the nearest friend. Friends see it too.
--   emergency -> mock EMS (client screen) + guardian.
-- One open alert per member per type (enforced by alerts_one_open_per_member_type);
-- raising a higher level upgrades that open alert in place.
-- Unresolved after 10 min -> re-escalate (ping -> alert; alert -> re-notify).
-- All timers are divided by a demo-speed factor passed by the caller.

-- ============================================================================
-- Guardian link signing secret (Supabase Vault)
-- ============================================================================

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'tether_guardian_token_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'tether_guardian_token_secret',
      'Signs Tether /guardian/:token links'
    );
  end if;
end;
$$;

-- ============================================================================
-- Internal helpers (not callable by clients)
-- ============================================================================

create or replace function public._distance_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- "200 ft" / "0.3 mi", mirrors formatDistance() in src/lib/geo.ts.
create or replace function public._fmt_distance(m float8)
returns text
language sql
immutable
as $$
  select case
    when m * 3.28084 < 528 then greatest(10, round(m * 3.28084 / 10) * 10)::int || ' ft'
    else to_char(m / 1609.34, 'FM990.0') || ' mi'
  end;
$$;

create or replace function public._level_rank(p_level text)
returns int
language sql
immutable
as $$
  select case p_level when 'ping' then 1 when 'alert' then 2 when 'emergency' then 3 else 0 end;
$$;

create or replace function public._guardian_token(p_alert_id uuid)
returns text
language sql
security definer
set search_path = public, extensions
stable
as $$
  select p_alert_id::text || '.' || left(encode(hmac(
    p_alert_id::text,
    (select decrypted_secret from vault.decrypted_secrets where name = 'tether_guardian_token_secret' limit 1),
    'sha256'
  ), 'hex'), 32);
$$;

-- Nearest other member with a known location (excluding anyone already home).
create or replace function public._nearest_member(p_member_id uuid)
returns table (member_id uuid, name text, phone text, distance_m float8)
language sql
security definer
set search_path = public
stable
as $$
  select o.id, o.name, p.phone, public._distance_m(me.lat, me.lng, o.lat, o.lng)
  from public.session_members me
  join public.session_members o
    on o.session_id = me.session_id and o.id <> me.id
  left join public.profiles p on p.id = o.user_id
  where me.id = p_member_id
    and me.lat is not null and o.lat is not null
    and o.status <> 'home'
  order by 4
  limit 1;
$$;

-- User ids of every other real member still out tonight.
create or replace function public._all_targets(p_member_id uuid)
returns uuid[]
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(array_agg(o.user_id), '{}')
  from public.session_members me
  join public.session_members o
    on o.session_id = me.session_id and o.id <> me.id
  where me.id = p_member_id
    and o.user_id is not null
    and o.status <> 'home';
$$;

-- Moves an open alert to 'alert' or 'emergency': targets the whole group and
-- writes the guardian SMS body into alerts.message. Until Twilio (Phase 7)
-- the SMS is logged and shown on the guardian view instead of being sent.
create or replace function public._apply_level(p_alert_id uuid, p_level text, p_base_url text)
returns public.alerts
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.alerts;
  m public.session_members;
  nr record;
  link text;
  instruction text;
  msg text;
begin
  select * into a from public.alerts where id = p_alert_id;
  select * into m from public.session_members where id = a.member_id;
  select * into nr from public._nearest_member(m.id);

  link := coalesce(p_base_url, '') || '/guardian/' || public._guardian_token(a.id);
  instruction := case
    when nr.name is not null then format('%s is %s from %s, call %s now.', nr.name, public._fmt_distance(nr.distance_m), m.name, nr.name)
    else format('Call %s now.', m.name)
  end;

  msg := case p_level
    when 'emergency' then format(
      'Tether EMERGENCY: %s triggered an emergency alert. (DEMO: 911 would be called with their location.) %s Details: %s',
      m.name, instruction, link)
    else format('Tether: %s needs help and asked us to contact you. %s Details: %s', m.name, instruction, link)
  end;

  update public.alerts
    set level = p_level,
        escalated_at = now(),
        target_user_ids = public._all_targets(m.id),
        message = msg
    where id = a.id
    returning * into a;

  raise log 'tether sms (disabled) to % <%>: %', m.guardian_name, m.guardian_phone, msg;
  return a;
end;
$$;

revoke all on function public._guardian_token(uuid) from public, anon, authenticated;
revoke all on function public._nearest_member(uuid) from public, anon, authenticated;
revoke all on function public._all_targets(uuid) from public, anon, authenticated;
revoke all on function public._apply_level(uuid, text, text) from public, anon, authenticated;

-- ============================================================================
-- Client-callable RPCs
-- ============================================================================

-- Raise (or upgrade) a member's alert. Returns {alert_id, level, guardian_token}.
-- Any session member may raise for any member in the same session (needed for
-- simulated friends and the keychain demo in later phases).
create or replace function public.raise_alert(
  p_member_id uuid,
  p_level text default 'ping',
  p_type text default 'manual',
  p_message text default null,
  p_base_url text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.session_members;
  a public.alerts;
  group_size int;
  targets uuid[];
  nearby uuid[];
begin
  if p_level not in ('ping', 'alert', 'emergency') then
    raise exception 'unknown level %', p_level;
  end if;

  select * into m from public.session_members where id = p_member_id;
  if m.id is null or not public.is_session_member(m.session_id) then
    raise exception 'not a member of this session';
  end if;

  targets := public._all_targets(m.id);
  select count(*) into group_size from public.session_members where session_id = m.session_id;

  if group_size > 5 and m.lat is not null then
    select coalesce(array_agg(o.user_id), '{}') into nearby
      from public.session_members o
      where o.session_id = m.session_id and o.id <> m.id
        and o.user_id is not null and o.lat is not null and o.status <> 'home'
        and public._distance_m(m.lat, m.lng, o.lat, o.lng) <= 61; -- 200 ft
    if cardinality(nearby) > 0 then
      targets := nearby;
    end if;
  end if;

  insert into public.alerts (session_id, member_id, level, type, message, target_user_ids)
    values (m.session_id, m.id, 'ping', p_type, coalesce(p_message, 'Come find me'), targets)
    on conflict (member_id, type) where not resolved do nothing;

  select * into a from public.alerts
    where member_id = m.id and type = p_type and not resolved;

  if public._level_rank(p_level) > public._level_rank(a.level) then
    a := public._apply_level(a.id, p_level, p_base_url);
  end if;

  if p_type = 'manual' then
    update public.session_members set status = 'needs_help' where id = m.id;
  end if;

  return json_build_object(
    'alert_id', a.id,
    'level', a.level,
    'guardian_token', case when a.level <> 'ping' then public._guardian_token(a.id) end
  );
end;
$$;

grant execute on function public.raise_alert(uuid, text, text, text, text) to authenticated;

-- "I'm on it": first claimer wins. Claiming stops repeat notifications.
create or replace function public.claim_alert(p_alert_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.alerts;
  me_id uuid;
begin
  select * into a from public.alerts where id = p_alert_id;
  if a.id is null or not public.is_session_member(a.session_id) then
    raise exception 'not a member of this session';
  end if;
  select id into me_id from public.session_members
    where session_id = a.session_id and user_id = auth.uid();
  update public.alerts set claimed_by = me_id
    where id = a.id and claimed_by is null and not resolved;
end;
$$;

grant execute on function public.claim_alert(uuid) to authenticated;

-- "I'm OK now" / "Found them": closes the alert and clears needs_help.
create or replace function public.resolve_alert(p_alert_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.alerts;
begin
  select * into a from public.alerts where id = p_alert_id;
  if a.id is null or not public.is_session_member(a.session_id) then
    raise exception 'not a member of this session';
  end if;
  update public.alerts set resolved = true where id = a.id;
  if a.type = 'manual' then
    update public.session_members set status = 'together'
      where id = a.member_id and status = 'needs_help';
  end if;
end;
$$;

grant execute on function public.resolve_alert(uuid) to authenticated;

-- Time-based steps of the ladder. Idempotent; safe for every client (and,
-- from Phase 4, pg_cron) to call repeatedly. Returns number of alerts changed.
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
    for update skip locked
  loop
    -- Narrow ping nobody claimed in 2 min -> whole group.
    if a.level = 'ping' and a.claimed_by is null
       and now() - a.created_at > interval '2 minutes' / speed then
      everyone := public._all_targets(a.member_id);
      if not (everyone <@ a.target_user_ids) then
        update public.alerts set target_user_ids = everyone where id = a.id;
        changed := changed + 1;
      end if;
    end if;

    -- Unresolved 10 min at this level -> re-escalate.
    if now() - coalesce(a.escalated_at, a.created_at) > interval '10 minutes' / speed then
      if a.level = 'ping' then
        perform public._apply_level(a.id, 'alert', p_base_url);
        changed := changed + 1;
      elsif a.level = 'alert' then
        -- Already at guardian level: re-notify rather than auto-dialing EMS.
        update public.alerts set escalated_at = now() where id = a.id;
        raise log 'tether sms (disabled) re-notify guardian for alert %: %', a.id, a.message;
        changed := changed + 1;
      end if;
    end if;
  end loop;

  return changed;
end;
$$;

grant execute on function public.escalate_alerts(uuid, float8, text) to authenticated;

-- Lets a member fetch the guardian link for an alert in their session (e.g.
-- the "Open guardian view" demo button after a page reload).
create or replace function public.get_guardian_token(p_alert_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.alerts;
begin
  select * into a from public.alerts where id = p_alert_id;
  if a.id is null or not public.is_session_member(a.session_id) then
    raise exception 'not a member of this session';
  end if;
  return public._guardian_token(a.id);
end;
$$;

grant execute on function public.get_guardian_token(uuid) to authenticated;

-- ============================================================================
-- Guardian view (no login): the signed token is the only credential.
-- ============================================================================

create or replace function public.guardian_view(p_token text)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  a_id uuid;
  a public.alerts;
  m public.session_members;
  s public.sessions;
  member_phone text;
  claimer text;
  nr record;
begin
  begin
    a_id := split_part(p_token, '.', 1)::uuid;
  exception when others then
    return null;
  end;
  if p_token is distinct from public._guardian_token(a_id) then
    return null;
  end if;

  select * into a from public.alerts where id = a_id;
  if a.id is null then return null; end if;
  select * into m from public.session_members where id = a.member_id;
  select * into s from public.sessions where id = a.session_id;
  select phone into member_phone from public.profiles where id = m.user_id;
  select name into claimer from public.session_members where id = a.claimed_by;
  select * into nr from public._nearest_member(m.id);

  return json_build_object(
    'member_name', m.name,
    'member_phone', member_phone,
    'guardian_name', m.guardian_name,
    'level', a.level,
    'message', a.message,
    'created_at', a.created_at,
    'resolved', a.resolved,
    'claimed_by_name', claimer,
    'session_status', s.status,
    'nearest', case when nr.name is null then null else json_build_object(
      'name', nr.name, 'phone', nr.phone, 'distance_m', nr.distance_m
    ) end
  );
end;
$$;

grant execute on function public.guardian_view(text) to anon, authenticated;
