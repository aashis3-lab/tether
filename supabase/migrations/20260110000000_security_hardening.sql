-- Tether, security hardening. No data-model changes: functions, policies and
-- a trigger only. Optional Vault secrets (see README "Security settings"):
--   tether_app_url     e.g. https://tether.vercel.app, the ONLY base URL used
--                      in guardian texts once set
--   tether_demo_speed  e.g. 60, the DEMO_SPEED applied when a client (not
--                      the Edge Function) runs escalate_alerts; default 1
--
-- Fixes:
--   1. Join codes were "TG" + 4 digits (10,000 possibilities, guessable in
--      seconds). Now 6 random characters from a 32-letter alphabet (~1 billion),
--      drawn with a cryptographic RNG. Still 6 chars and unique.
--   2. Any co-member (even from a party months ago) could read your whole
--      profile: home address, medical info, emergency contacts. Peers now get
--      only name + avatar, plus phone while you share an active party, through
--      peer_profiles().
--   3. Members could write other members' rows (location, guardian phone,
--      status), edit or end the session row directly, and insert / edit /
--      delete alerts and check-ins. Now: you update only your own member row
--      (and can't move it to another party), and alerts / check-ins / sessions
--      change only through the RPCs.
--   4. RPCs acted on any member: raise_alert / help_pressed for anyone,
--      respond_check_in for anyone, resolve_alert by anyone. Now: raise and
--      answer only for yourself; resolve if it's your alert or you claimed it.
--   5. Guardian text links used a base URL sent by the client, and
--      escalate_alerts used a client-sent demo speed (instant escalation to
--      guardians). Both now come from server config.
--   6. "Send test text" could be fired once per second. Now once a minute and
--      10 a day.

-- ============================================================================
-- Server config helpers
-- ============================================================================

create or replace function public._app_base_url(p_client text)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v text;
begin
  select decrypted_secret into v from vault.decrypted_secrets where name = 'tether_app_url' limit 1;
  if coalesce(trim(v), '') <> '' then
    return rtrim(trim(v), '/');
  end if;
  -- Not configured yet: keep links working in development, but say so.
  raise log 'tether: vault secret tether_app_url is not set, using the client base URL %', p_client;
  return rtrim(coalesce(p_client, ''), '/');
end;
$$;

create or replace function public._demo_speed()
returns float8
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v text;
begin
  select decrypted_secret into v from vault.decrypted_secrets where name = 'tether_demo_speed' limit 1;
  return greatest(coalesce(nullif(trim(v), '')::float8, 1), 0.01);
exception when others then
  return 1;
end;
$$;

revoke all on function public._app_base_url(text) from public, anon, authenticated;
revoke all on function public._demo_speed() from public, anon, authenticated;

-- ============================================================================
-- 1. Join codes
-- ============================================================================

create or replace function public.generate_join_code()
returns text
language plpgsql
set search_path = public, extensions
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 chars, no 0/O/1/I
  bytes bytea;
  code text;
  i int;
begin
  loop
    bytes := gen_random_bytes(6);
    code := '';
    for i in 0..5 loop
      -- 256 is a multiple of 32, so this has no modulo bias.
      code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.sessions s where s.join_code = code);
  end loop;
  return code;
end;
$$;

-- ============================================================================
-- 2. Profile visibility
-- ============================================================================

drop policy if exists "profiles_select_session_peers" on public.profiles;

-- Name + avatar for anyone you've shared a party with (party history), phone
-- only while you're both in an active party. Never address, medical info or
-- emergency contacts.
create or replace function public.peer_profiles(p_user_ids uuid[])
returns table (id uuid, name text, avatar_url text, phone text)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.name,
    p.avatar_url,
    case when exists (
      select 1
      from public.session_members me
      join public.session_members them on them.session_id = me.session_id
      join public.sessions s on s.id = me.session_id
      where me.user_id = auth.uid() and them.user_id = p.id and s.status = 'active'
    ) then p.phone end
  from public.profiles p
  where p.id = any(p_user_ids)
    and exists (
      select 1
      from public.session_members me
      join public.session_members them on them.session_id = me.session_id
      where me.user_id = auth.uid() and them.user_id = p.id
    );
$$;

revoke all on function public.peer_profiles(uuid[]) from public, anon;
grant execute on function public.peer_profiles(uuid[]) to authenticated;

-- ============================================================================
-- 3. Row-level write access
-- ============================================================================

-- sessions: created by create_session(), ended by end_session(). No direct writes.
drop policy if exists "sessions_insert_creator" on public.sessions;
drop policy if exists "sessions_update_member" on public.sessions;

-- session_members: read peers (unchanged), write only your own row. Joining
-- is join_session(); there is no direct insert or delete.
drop policy if exists "session_members_update_peers" on public.session_members;
drop policy if exists "session_members_delete_peers" on public.session_members;

create policy "session_members_update_own"
  on public.session_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- A member row never moves to another party or person (otherwise updating
-- your own row's session_id would join any party without its code).
create or replace function public.session_members_freeze_keys()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.session_id is distinct from old.session_id
     or new.user_id is distinct from old.user_id then
    raise exception 'session_members id, session_id and user_id cannot change';
  end if;
  return new;
end;
$$;

drop trigger if exists session_members_freeze_keys on public.session_members;
create trigger session_members_freeze_keys
  before update on public.session_members
  for each row
  execute function public.session_members_freeze_keys();

-- alerts / check_ins: members read; writes only through RPCs and the Edge
-- Function (service role bypasses RLS).
drop policy if exists "alerts_all_members" on public.alerts;
create policy "alerts_select_members"
  on public.alerts for select
  using (public.is_session_member(session_id));

drop policy if exists "check_ins_all_members" on public.check_ins;
create policy "check_ins_select_members"
  on public.check_ins for select
  using (public.is_session_member(session_id));

-- pins stay editable by every member (anyone can add tonight's next venue).

-- ============================================================================
-- 4 + 5. RPCs: act only for yourself, server-side base URL and demo speed
-- ============================================================================

-- True when the caller is the person behind this member row (or the service role).
create or replace function public._is_me(p_member_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(auth.role(), '') = 'service_role'
      or exists (select 1 from public.session_members where id = p_member_id and user_id = auth.uid());
$$;

revoke all on function public._is_me(uuid) from public, anon, authenticated;

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
  if m.id is null or not public._is_me(m.id) then
    raise exception 'you can only raise an alert for yourself';
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

-- "I'm OK" / "Cancel" by the person, or "Found them" by whoever claimed it.
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
  if not public._is_me(a.member_id)
     and not exists (select 1 from public.session_members where id = a.claimed_by and user_id = auth.uid()) then
    raise exception 'only the person or whoever is on it can close this alert';
  end if;
  update public.alerts set resolved = true where id = a.id;
  if a.type = 'manual' then
    update public.session_members set status = 'together'
      where id = a.member_id and status = 'needs_help';
  end if;
end;
$$;

grant execute on function public.resolve_alert(uuid) to authenticated;

-- Same as 20260106 (design refresh), but only for your own check-ins.
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
  if c.id is null or not public._is_me(c.member_id) then
    raise exception 'you can only answer your own check-in';
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
      update public.session_members
        set status = 'heading_home', status_note = 'Heading home', eta = null, leaving_with = '{solo}'
        where id = c.member_id;
    when 'elsewhere' then
      update public.session_members
        set status = 'separated', status_note = 'Going somewhere else', leaving_with = '{solo}'
        where id = c.member_id;
    when 'home' then
      update public.session_members
        set status = 'home', status_note = 'Home', eta = null,
            rule_state = jsonb_build_object('home_at', now())
        where id = c.member_id;
    when 'help' then
      perform public.raise_alert(c.member_id, 'ping', 'manual', 'I need help', p_base_url);
  end case;
end;
$$;

grant execute on function public.respond_check_in(uuid, text, text) to authenticated;

-- Same as 20260109, but the link base comes from _app_base_url().
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
  msg text;
begin
  select * into a from public.alerts where id = p_alert_id;
  select * into m from public.session_members where id = a.member_id;
  select * into nr from public._nearest_member(m.id);

  link := public._app_base_url(p_base_url) || '/g/' || public._guardian_short(a.id);

  msg := case p_level
    when 'emergency' then public._sms_fit(
      format('Tether EMERGENCY: %s triggered an emergency.%s Live:',
        m.name,
        case when nr.name is not null then format(' %s is %s away.', nr.name, public._fmt_distance(nr.distance_m)) else '' end),
      link)
    else public._sms_fit(
      format('Tether: %s needs help.%s Live:',
        m.name,
        case when nr.name is not null then format(' Call %s, %s away.', nr.name, public._fmt_distance(nr.distance_m)) else format(' Call %s.', m.name) end),
      link)
  end;

  update public.alerts
    set level = p_level,
        escalated_at = now(),
        target_user_ids = public._all_targets(m.id),
        message = msg
    where id = a.id
    returning * into a;

  perform public._queue_sms('level:' || a.id || ':' || p_level, m.session_id, m.id, null, m.guardian_name, m.guardian_phone, msg);
  return a;
end;
$$;

revoke all on function public._apply_level(uuid, text, text) from public, anon, authenticated;
grant execute on function public._apply_level(uuid, text, text) to service_role;

-- Same as 20260109; raise_alert now enforces "only for yourself".
create or replace function public.help_pressed(p_member_id uuid, p_base_url text default '')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r json;
  m public.session_members;
  nr record;
  aid uuid;
  link text;
  msg text;
begin
  r := public.raise_alert(p_member_id, 'ping', 'manual', 'I need help', p_base_url);
  aid := (r->>'alert_id')::uuid;
  select * into m from public.session_members where id = p_member_id;
  select * into nr from public._nearest_member(m.id);
  link := public._app_base_url(p_base_url) || '/g/' || public._guardian_short(aid);
  msg := public._sms_fit(
    format('Tether: %s pressed HELP.%s Live:',
      m.name,
      case when nr.name is not null then format(' %s is %s away.', nr.name, public._fmt_distance(nr.distance_m)) else '' end),
    link);
  perform public._queue_sms('help:' || aid, m.session_id, m.id, auth.uid(), m.guardian_name, m.guardian_phone, msg);
  return r;
end;
$$;

grant execute on function public.help_pressed(uuid, text) to authenticated;

-- Same as 20260105, but only the service role (Edge Function) picks the demo
-- speed; app callers get the server's tether_demo_speed.
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
  is_service boolean := coalesce(auth.role(), '') = 'service_role';
  speed float8;
  everyone uuid[];
  changed int := 0;
begin
  if not is_service and not public.is_session_member(p_session_id) then
    raise exception 'not a member of this session';
  end if;
  speed := case when is_service then greatest(coalesce(p_demo_speed, 1), 0.01) else public._demo_speed() end;

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
        changed := changed + 1;
      end if;
    end if;
  end loop;

  return changed;
end;
$$;

grant execute on function public.escalate_alerts(uuid, float8, text) to authenticated, service_role;

-- ============================================================================
-- 6. Test text rate limit
-- ============================================================================

create or replace function public.queue_test_sms()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  m public.session_members;
  to_name text;
  to_phone text;
  oid uuid;
  key text := 'test:' || auth.uid() || ':' || extract(epoch from now())::bigint;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'create a profile first'; end if;

  if exists (select 1 from public.sms_outbox
             where requested_by = auth.uid() and event_key like 'test:%'
               and created_at > now() - interval '1 minute') then
    raise exception 'Please wait a minute before sending another test text.';
  end if;
  if (select count(*) from public.sms_outbox
      where requested_by = auth.uid() and event_key like 'test:%'
        and created_at > now() - interval '1 day') >= 10 then
    raise exception 'That''s 10 test texts today. Try again tomorrow.';
  end if;

  select sm.* into m
    from public.session_members sm join public.sessions s on s.id = sm.session_id
    where sm.user_id = auth.uid() and s.status = 'active'
    order by s.created_at desc limit 1;

  to_name := coalesce(m.guardian_name, me.emergency_contact_name);
  to_phone := coalesce(nullif(m.guardian_phone, ''), me.emergency_contact_phone);
  if coalesce(trim(to_phone), '') = '' then
    raise exception 'no guardian or emergency contact phone to text';
  end if;

  perform public._queue_sms(key, m.session_id, m.id, auth.uid(), to_name, to_phone,
    format('Tether test: %s added you as their safety contact. You will only hear from us if they need help.', me.name));
  select id into oid from public.sms_outbox where event_key = key;
  return oid;
end;
$$;

grant execute on function public.queue_test_sms() to authenticated;
