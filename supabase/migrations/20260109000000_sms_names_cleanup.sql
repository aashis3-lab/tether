-- Tether: party names, venue types, real SMS (Twilio) outbox, short guardian
-- links, and removal of the simulated-friend insert path.
--
-- Data-model changes (requested):
--   sessions.name      optional party name ("Friday at Red Lion")
--   pins.kind          venue type for the map pin icon (bar/pub/nightclub/restaurant)
--   guardian_links     short codes for /g/<code> links so texts fit in 160 chars
--   sms_outbox         one row per text; event_key is unique so a text is
--                      queued at most once no matter how often cron runs
--
-- Texts are queued only on: HELP pressed, alert escalated to the guardian
-- (alert / emergency), everyone home. The evaluate-session Edge Function
-- sends queued rows through Twilio and records sent / failed + the reason.

alter table public.sessions add column if not exists name text;
alter table public.pins add column if not exists kind text
  check (kind is null or kind in ('bar', 'pub', 'nightclub', 'restaurant'));

-- No simulated friends: members are only ever added through join_session().
drop policy if exists "session_members_insert_simulated" on public.session_members;

-- ============================================================================
-- Short guardian links
-- ============================================================================

create table if not exists public.guardian_links (
  code text primary key,
  alert_id uuid not null unique references public.alerts (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.guardian_links enable row level security;
-- No policies: only SECURITY DEFINER functions touch this table.

create or replace function public._guardian_short(p_alert_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c text;
begin
  select code into c from public.guardian_links where alert_id = p_alert_id;
  if c is not null then return c; end if;
  loop
    c := lower(substr(encode(extensions.gen_random_bytes(9), 'base64'), 1, 10));
    c := regexp_replace(c, '[^a-z0-9]', 'x', 'g');
    begin
      insert into public.guardian_links (code, alert_id) values (c, p_alert_id);
      return c;
    exception when unique_violation then
      select code into c from public.guardian_links where alert_id = p_alert_id;
      if c is not null then return c; end if;
    end;
  end loop;
end;
$$;

revoke all on function public._guardian_short(uuid) from public, anon, authenticated;

-- ============================================================================
-- SMS outbox
-- ============================================================================

create table if not exists public.sms_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  session_id uuid references public.sessions (id) on delete set null,
  member_id uuid references public.session_members (id) on delete set null,
  requested_by uuid references public.profiles (id) on delete set null,
  to_name text,
  to_phone text not null,
  body text not null check (char_length(body) <= 160),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  error text,
  provider_sid text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.sms_outbox enable row level security;

-- You can see texts you requested or that were about you (Settings shows
-- the latest result and any failure reason). Writes go through functions.
drop policy if exists "sms_outbox_select_own" on public.sms_outbox;
create policy "sms_outbox_select_own"
  on public.sms_outbox for select
  using (
    requested_by = auth.uid()
    or exists (
      select 1 from public.session_members m
      where m.id = sms_outbox.member_id and m.user_id = auth.uid()
    )
  );

-- Fit a message + link into 160 chars (link always kept whole).
create or replace function public._sms_fit(p_text text, p_link text default null)
returns text
language sql
immutable
as $$
  select case
    when p_link is null or p_link = '' then left(p_text, 160)
    else left(p_text, 160 - char_length(p_link) - 1) || ' ' || p_link
  end;
$$;

-- Queue a text once per event_key. Missing phone -> nothing queued.
create or replace function public._queue_sms(
  p_event_key text,
  p_session_id uuid,
  p_member_id uuid,
  p_requested_by uuid,
  p_to_name text,
  p_to_phone text,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(p_to_phone), '') = '' then
    return;
  end if;
  insert into public.sms_outbox (event_key, session_id, member_id, requested_by, to_name, to_phone, body)
    values (p_event_key, p_session_id, p_member_id, p_requested_by, p_to_name, trim(p_to_phone), left(p_body, 160))
    on conflict (event_key) do nothing;
end;
$$;

revoke all on function public._sms_fit(text, text) from public, anon, authenticated;
revoke all on function public._queue_sms(text, uuid, uuid, uuid, text, text, text) from public, anon, authenticated;

-- ============================================================================
-- Guardian alert level: now texts the guardian (once per level per alert)
-- ============================================================================

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

  link := coalesce(nullif(p_base_url, ''), '') || '/g/' || public._guardian_short(a.id);

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

-- HELP pressed: raise the help alert (same ladder) and text the guardian once
-- for this alert.
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
  link := coalesce(nullif(p_base_url, ''), '') || '/g/' || public._guardian_short(aid);
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

-- "Send test text" in Settings: tonight's guardian if you're at a party,
-- otherwise your primary emergency contact.
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

-- ============================================================================
-- create_session with an optional party name; preview returns the name
-- ============================================================================

drop function if exists public.create_session(timestamptz, text, text, jsonb);

create or replace function public.create_session(
  p_end_time timestamptz,
  p_guardian_name text,
  p_guardian_phone text,
  p_pins jsonb default '[]'::jsonb,
  p_name text default null
)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  s public.sessions;
  pin jsonb;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then
    raise exception 'create a profile before starting a party';
  end if;

  insert into public.sessions (creator_id, end_time, name)
    values (auth.uid(), p_end_time, nullif(trim(coalesce(p_name, '')), ''))
    returning * into s;

  insert into public.session_members (session_id, user_id, name, guardian_name, guardian_phone)
    values (s.id, auth.uid(), me.name, p_guardian_name, p_guardian_phone);

  for pin in select * from jsonb_array_elements(coalesce(p_pins, '[]'::jsonb)) loop
    insert into public.pins (session_id, name, lat, lng, radius_m, kind)
      values (
        s.id,
        coalesce(nullif(pin->>'name', ''), 'Venue'),
        (pin->>'lat')::double precision,
        (pin->>'lng')::double precision,
        coalesce((pin->>'radius_m')::int, 150),
        case when pin->>'kind' in ('bar', 'pub', 'nightclub', 'restaurant') then pin->>'kind' end
      );
  end loop;

  return s;
end;
$$;

revoke all on function public.create_session(timestamptz, text, text, jsonb, text) from public, anon;
grant execute on function public.create_session(timestamptz, text, text, jsonb, text) to authenticated;

drop function if exists public.session_preview(text);

create function public.session_preview(p_join_code text)
returns table (
  session_id uuid,
  creator_name text,
  party_name text,
  member_count bigint,
  member_names text[],
  member_avatars text[],
  venue_name text,
  end_time timestamptz,
  status text
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    p.name,
    s.name,
    (select count(*) from public.session_members sm where sm.session_id = s.id),
    (select array_agg(split_part(sm.name, ' ', 1) order by sm.created_at)
       from public.session_members sm where sm.session_id = s.id),
    (select array_agg(mp.avatar_url order by sm.created_at)
       from public.session_members sm
       left join public.profiles mp on mp.id = sm.user_id
       where sm.session_id = s.id),
    (select pn.name from public.pins pn where pn.session_id = s.id order by pn.created_at limit 1),
    s.end_time,
    s.status
  from public.sessions s
  join public.profiles p on p.id = s.creator_id
  where s.join_code = public._normalize_code(p_join_code)
    and s.status = 'active';
$$;

revoke all on function public.session_preview(text) from public, anon;
grant execute on function public.session_preview(text) to authenticated;

-- ============================================================================
-- end_session: no simulated members anymore; texts each guardian once when
-- everyone made it home.
-- ============================================================================

create or replace function public.end_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.sessions;
  m public.session_members;
  all_home boolean;
  label text;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_session_member(p_session_id) then
    raise exception 'not a member of this session';
  end if;

  select * into s from public.sessions where id = p_session_id;
  if s.status = 'ended' then return; end if;

  select bool_and(status = 'home') into all_home from public.session_members where session_id = p_session_id;
  label := coalesce(s.name, (select p.name from public.pins p where p.session_id = p_session_id order by p.created_at limit 1), 'the party');

  if coalesce(all_home, false) then
    for m in select * from public.session_members where session_id = p_session_id loop
      perform public._queue_sms('home:' || p_session_id || ':' || m.id, p_session_id, m.id, null,
        m.guardian_name, m.guardian_phone,
        format('Tether: %s is home safe. Everyone from %s made it home.', m.name, label));
    end loop;
  end if;

  update public.sessions
    set status = 'ended',
        venue_names = coalesce(
          (select array_agg(p.name order by p.created_at) from public.pins p where p.session_id = p_session_id),
          '{}'
        )
    where id = p_session_id;

  delete from public.pins where session_id = p_session_id;
  delete from public.alerts where session_id = p_session_id;
  delete from public.check_ins where session_id = p_session_id;

  update public.session_members
    set lat = null, lng = null, battery_level = null, eta = null,
        activity = null, activity_until = null,
        rule_state = case when rule_state ? 'home_at'
                          then jsonb_build_object('home_at', rule_state->'home_at')
                          else '{}'::jsonb end
    where session_id = p_session_id;
end;
$$;

grant execute on function public.end_session(uuid) to authenticated, service_role;

-- ============================================================================
-- Guardian view accepts the short /g/<code> as well as the old signed token.
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
  if position('.' in coalesce(p_token, '')) = 0 then
    select alert_id into a_id from public.guardian_links where code = lower(p_token);
    if a_id is null then return null; end if;
  else
    begin
      a_id := split_part(p_token, '.', 1)::uuid;
    exception when others then
      return null;
    end;
    if p_token is distinct from public._guardian_token(a_id) then
      return null;
    end if;
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
