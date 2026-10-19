-- Observing mode for guardians: a read-only view of the whole party through
-- the guardian link (no login). No data-model change: a new read-only
-- function over existing tables.
--
-- guardian_party_view(token) returns the party (name, end time, status) and
-- every member's name, status, live location, battery, last update, picture
-- and phone (so the guardian can call a member), plus the current alert
-- instruction fields. Only while the party is active; returns null for a bad
-- token or an ended party (locations are deleted at the end anyway).

create or replace function public._guardian_alert_id(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  a_id uuid;
begin
  if position('.' in coalesce(p_token, '')) = 0 then
    select alert_id into a_id from public.guardian_links where code = lower(p_token);
    return a_id;
  end if;
  begin
    a_id := split_part(p_token, '.', 1)::uuid;
  exception when others then
    return null;
  end;
  if p_token is distinct from public._guardian_token(a_id) then
    return null;
  end if;
  return a_id;
end;
$$;

revoke all on function public._guardian_alert_id(text) from public, anon, authenticated;

create or replace function public.guardian_party_view(p_token text)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  a_id uuid := public._guardian_alert_id(p_token);
  a public.alerts;
  s public.sessions;
begin
  if a_id is null then return null; end if;
  select * into a from public.alerts where id = a_id;
  if a.id is null then return null; end if;
  select * into s from public.sessions where id = a.session_id;
  if s.id is null or s.status <> 'active' then return null; end if;

  return json_build_object(
    'session_id', s.id,
    'party_name', coalesce(s.name, (select p.name from public.pins p where p.session_id = s.id order by p.created_at limit 1)),
    'end_time', s.end_time,
    'alert_member_id', a.member_id,
    'members', coalesce((
      select json_agg(json_build_object(
        'id', m.id,
        'name', m.name,
        'status', m.status,
        'status_note', m.status_note,
        'lat', m.lat,
        'lng', m.lng,
        'battery_level', m.battery_level,
        'last_updated', m.last_updated,
        'avatar_url', pr.avatar_url,
        'phone', pr.phone
      ) order by m.created_at)
      from public.session_members m
      left join public.profiles pr on pr.id = m.user_id
      where m.session_id = s.id
    ), '[]'::json),
    'pins', coalesce((
      select json_agg(json_build_object('id', p.id, 'name', p.name, 'lat', p.lat, 'lng', p.lng, 'radius_m', p.radius_m))
      from public.pins p where p.session_id = s.id
    ), '[]'::json)
  );
end;
$$;

grant execute on function public.guardian_party_view(text) to anon, authenticated;
