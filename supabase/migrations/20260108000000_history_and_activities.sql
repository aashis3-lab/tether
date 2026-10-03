-- Tether, party history + Update statuses.
--
-- Data-model changes (requested):
--   sessions.venue_names text[]         venue names kept for party history
--   session_members.activity text       current Update status key ("bathroom", "drinks", …)
--   session_members.activity_until tz   when a short-lived status auto-expires
--
-- Privacy: when a party ends we keep only date, venue NAMES, members, guardian
-- and home-arrival times. Locations, venue pins (coordinates), alerts (their
-- messages can include distances) and check-ins are deleted. No location
-- tracks are ever stored.

alter table public.sessions
  add column if not exists venue_names text[] not null default '{}';

alter table public.session_members
  add column if not exists activity text,
  add column if not exists activity_until timestamptz;

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
  delete from public.session_members where session_id = p_session_id and is_simulated;

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

-- Backfill parties that already ended under the old end_session().
update public.sessions s
  set venue_names = coalesce(
    (select array_agg(p.name order by p.created_at) from public.pins p where p.session_id = s.id), '{}')
  where s.status = 'ended' and s.venue_names = '{}';

delete from public.pins p using public.sessions s where p.session_id = s.id and s.status = 'ended';
delete from public.alerts a using public.sessions s where a.session_id = s.id and s.status = 'ended';
delete from public.check_ins c using public.sessions s where c.session_id = s.id and s.status = 'ended';
update public.session_members m
  set lat = null, lng = null, battery_level = null, eta = null, activity = null, activity_until = null
  from public.sessions s
  where m.session_id = s.id and s.status = 'ended';
