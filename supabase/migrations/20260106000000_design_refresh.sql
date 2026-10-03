-- Tether, design refresh support. No data-model changes: functions only.
--
--  * Join codes look like the design: "TG" + 4 digits (shown as "TG 4826").
--    Still 6 chars and unique. Spaces/case are ignored when joining.
--  * session_preview() also returns member first names and the first venue,
--    for the "Is this your group?" card.
--  * Arrival time is kept in rule_state.home_at (set by evaluate-session or
--    an "I'm home" answer) and survives end_session(), so the morning
--    summary can say "the last person arrived at 1:11 AM". Locations are
--    still wiped.

create or replace function public.generate_join_code()
returns text
language plpgsql
as $$
declare
  code text;
begin
  loop
    code := 'TG' || lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (select 1 from public.sessions s where s.join_code = code);
  end loop;
  return code;
end;
$$;

-- "tg 4826", "TG-4826" -> "TG4826"
create or replace function public._normalize_code(p text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

drop function if exists public.session_preview(text);

create function public.session_preview(p_join_code text)
returns table (
  session_id uuid,
  creator_name text,
  member_count bigint,
  member_names text[],
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
    (select count(*) from public.session_members sm where sm.session_id = s.id),
    (select array_agg(split_part(sm.name, ' ', 1) order by sm.created_at)
       from public.session_members sm where sm.session_id = s.id),
    (select pn.name from public.pins pn where pn.session_id = s.id order by pn.created_at limit 1),
    s.end_time,
    s.status
  from public.sessions s
  join public.profiles p on p.id = s.creator_id
  where s.join_code = public._normalize_code(p_join_code)
    and s.status = 'active';
$$;

revoke all on function public.session_preview(text) from public;
grant execute on function public.session_preview(text) to authenticated;

create or replace function public.join_session(
  p_join_code text,
  p_guardian_name text,
  p_guardian_phone text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  sid uuid;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then
    raise exception 'create a profile before joining a session';
  end if;

  select id into sid
    from public.sessions
    where join_code = public._normalize_code(p_join_code)
      and status = 'active';
  if sid is null then
    raise exception 'no active night out with that code';
  end if;

  insert into public.session_members (session_id, user_id, name, guardian_name, guardian_phone)
    values (sid, auth.uid(), me.name, p_guardian_name, p_guardian_phone)
    on conflict (session_id, user_id) where user_id is not null
    do update set guardian_name = excluded.guardian_name,
                  guardian_phone = excluded.guardian_phone,
                  status = 'together',
                  status_note = null;

  return sid;
end;
$$;

-- end_session: same as Phase 4, but keeps rule_state.home_at.
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
    set lat = null, lng = null, battery_level = null,
        rule_state = case when rule_state ? 'home_at'
                          then jsonb_build_object('home_at', rule_state->'home_at')
                          else '{}'::jsonb end
    where session_id = p_session_id;

  update public.alerts set resolved = true where session_id = p_session_id and not resolved;
  update public.check_ins set responded_at = now(), response = 'session_ended'
    where session_id = p_session_id and responded_at is null;
end;
$$;

-- respond_check_in: same as Phase 4, plus home_at on "I'm home".
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
