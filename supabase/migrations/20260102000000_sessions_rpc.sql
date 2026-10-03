-- Tether, Phase 2: session create/join RPCs + RLS fixes.
-- No data-model changes; only functions, policies, and realtime publication.

-- Creating a session and adding the creator as its first member must happen
-- atomically: under plain RLS the creator can't read back the session row
-- they just inserted (they aren't a member yet), so the client would need
-- two round trips with a window where the session is orphaned. These RPCs
-- run as SECURITY DEFINER and do it in one transaction.

create or replace function public.create_session(
  p_end_time timestamptz,
  p_guardian_name text,
  p_guardian_phone text,
  p_pins jsonb default '[]'::jsonb
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
    raise exception 'create a profile before starting a session';
  end if;

  insert into public.sessions (creator_id, end_time)
    values (auth.uid(), p_end_time)
    returning * into s;

  insert into public.session_members (session_id, user_id, name, guardian_name, guardian_phone)
    values (s.id, auth.uid(), me.name, p_guardian_name, p_guardian_phone);

  for pin in select * from jsonb_array_elements(coalesce(p_pins, '[]'::jsonb)) loop
    insert into public.pins (session_id, name, lat, lng, radius_m)
      values (
        s.id,
        coalesce(nullif(pin->>'name', ''), 'Venue'),
        (pin->>'lat')::double precision,
        (pin->>'lng')::double precision,
        coalesce((pin->>'radius_m')::int, 150)
      );
  end loop;

  return s;
end;
$$;

revoke all on function public.create_session(timestamptz, text, text, jsonb) from public;
grant execute on function public.create_session(timestamptz, text, text, jsonb) to authenticated;

-- Joins by code. Idempotent: re-joining a session you're already in just
-- updates your guardian and returns the same session id.
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
    where join_code = upper(trim(p_join_code))
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

revoke all on function public.join_session(text, text, text) from public;
grant execute on function public.join_session(text, text, text) to authenticated;

-- Real members now join only through join_session(), so the direct-insert
-- policy no longer needs the "insert yourself into any session id" branch.
-- Simulated demo friends can still be added directly by an existing member.
drop policy if exists "session_members_insert_self_or_simulated" on public.session_members;

create policy "session_members_insert_simulated"
  on public.session_members for insert
  with check (user_id is null and is_simulated and public.is_session_member(session_id));

-- Creators can always read their own session row (covers the brief moment
-- before membership exists, and any client code that selects by creator).
create policy "sessions_select_creator"
  on public.sessions for select
  using (creator_id = auth.uid());

-- Clients listen for status -> 'ended' to leave the active screen.
alter publication supabase_realtime add table public.sessions;
alter publication supabase_realtime add table public.pins;
