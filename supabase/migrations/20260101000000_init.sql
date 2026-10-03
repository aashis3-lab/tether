-- Tether, initial schema
-- Tables: profiles, sessions, session_members, pins, alerts, check_ins
-- See CLAUDE.md "DATA MODEL" for the spec this implements.
--
-- Structure of this file: all tables first (so later tables can reference
-- earlier ones via FK), then all functions/triggers/RLS policies (so a
-- policy can freely reference any table regardless of creation order).

create extension if not exists pgcrypto;

-- ============================================================================
-- Tables
-- ============================================================================

-- One row per auth user. Created by the app right after sign-up.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  phone text not null,
  home_lat double precision,
  home_lng double precision,
  home_address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  medical_info text,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  join_code text not null unique,
  end_time timestamptz not null,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now()
);

create table public.session_members (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  -- Denormalized display name, filled in when the row is created (from the
  -- joining user's profile for real members, or set directly for simulated
  -- demo friends who have no profile). Avoids a join just to render a name.
  name text not null,
  guardian_name text,
  guardian_phone text,
  lat double precision,
  lng double precision,
  battery_level int check (battery_level between 0 and 100),
  status text not null default 'together'
    check (status in ('together', 'separated', 'left_alone', 'heading_home', 'home', 'needs_help')),
  status_note text,
  leaving_with text[] not null default '{}', -- member ids (as text) or the literal 'solo'
  eta timestamptz,
  last_updated timestamptz not null default now(),
  is_simulated boolean not null default false,
  created_at timestamptz not null default now()
);

-- A real user can only be in a given session once. Simulated members have no
-- user_id (null), and Postgres treats NULLs as distinct for unique indexes,
-- so this only constrains real members.
create unique index session_members_session_user_unique
  on public.session_members (session_id, user_id)
  where user_id is not null;

create table public.pins (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  radius_m int not null default 150,
  created_at timestamptz not null default now()
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  member_id uuid not null references public.session_members (id) on delete cascade,
  level text not null check (level in ('ping', 'alert', 'emergency')),
  type text not null check (type in ('manual', 'separation', 'left_alone', 'battery', 'not_home', 'fake_call')),
  message text,
  target_user_ids uuid[] not null default '{}',
  claimed_by uuid references public.session_members (id),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  escalated_at timestamptz
);

-- One open (unresolved) alert per member per type at a time.
create unique index alerts_one_open_per_member_type
  on public.alerts (member_id, type)
  where not resolved;

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  member_id uuid not null references public.session_members (id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  response text
);

-- ============================================================================
-- Functions
-- ============================================================================

-- Generates a 6-character uppercase join code, retrying on collision.
create or replace function public.generate_join_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I to avoid ambiguity
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, (floor(random() * length(alphabet)) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from public.sessions s where s.join_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.set_join_code()
returns trigger
language plpgsql
as $$
begin
  if new.join_code is null or new.join_code = '' then
    new.join_code := public.generate_join_code();
  end if;
  return new;
end;
$$;

create trigger sessions_set_join_code
  before insert on public.sessions
  for each row
  execute function public.set_join_code();

create or replace function public.touch_last_updated()
returns trigger
language plpgsql
as $$
begin
  new.last_updated := now();
  return new;
end;
$$;

create trigger session_members_touch_last_updated
  before update on public.session_members
  for each row
  execute function public.touch_last_updated();

-- Membership check used by most policies below: is the caller a member of
-- this session_id? SECURITY DEFINER so it can be called from a policy on
-- another table (e.g. profiles) without that table's RLS recursing into
-- session_members' own RLS.
create or replace function public.is_session_member(p_session_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.session_members sm
    where sm.session_id = p_session_id
      and sm.user_id = auth.uid()
  );
$$;

-- Lets a user preview a session by join code before becoming a member
-- (screen 3: "Join Maya's night out: 3 people") without exposing member
-- locations or other sensitive fields via a broad SELECT policy.
create or replace function public.session_preview(p_join_code text)
returns table (
  session_id uuid,
  creator_name text,
  member_count bigint,
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
    s.end_time,
    s.status
  from public.sessions s
  join public.profiles p on p.id = s.creator_id
  where s.join_code = upper(p_join_code)
    and s.status = 'active';
$$;

revoke all on function public.session_preview(text) from public;
grant execute on function public.session_preview(text) to authenticated;

-- Ends a session: marks it ended, wipes live location + battery fields, and
-- removes simulated members entirely (per spec: "When a session ends, delete
-- all location fields and simulated members"). Runs as the caller (RLS
-- applies via is_session_member), so only a member of the session can end it.
create or replace function public.end_session(p_session_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_session_member(p_session_id) then
    raise exception 'not a member of this session';
  end if;

  update public.sessions
    set status = 'ended'
    where id = p_session_id;

  delete from public.session_members
    where session_id = p_session_id
      and is_simulated;

  update public.session_members
    set lat = null,
        lng = null,
        battery_level = null
    where session_id = p_session_id;
end;
$$;

grant execute on function public.end_session(uuid) to authenticated;

-- ============================================================================
-- Row level security
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.session_members enable row level security;
alter table public.pins enable row level security;
alter table public.alerts enable row level security;
alter table public.check_ins enable row level security;

-- profiles --------------------------------------------------------------

create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid());

-- Let a user read co-members' profile fields (wallet card, guardian
-- defaults) for anyone who shares a session with them.
create policy "profiles_select_session_peers"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.session_members me
      join public.session_members them
        on them.session_id = me.session_id
      where me.user_id = auth.uid()
        and them.user_id = public.profiles.id
    )
  );

-- sessions ----------------------------------------------------------------

create policy "sessions_select_member"
  on public.sessions for select
  using (public.is_session_member(id));

create policy "sessions_insert_creator"
  on public.sessions for insert
  with check (creator_id = auth.uid());

create policy "sessions_update_member"
  on public.sessions for update
  using (public.is_session_member(id));

-- session_members -----------------------------------------------------------

create policy "session_members_select_peers"
  on public.session_members for select
  using (public.is_session_member(session_id));

create policy "session_members_insert_self_or_simulated"
  on public.session_members for insert
  with check (
    -- joining as yourself...
    (user_id = auth.uid())
    -- ...or adding a simulated friend to a session you already belong to
    or (user_id is null and is_simulated and public.is_session_member(session_id))
  );

create policy "session_members_update_peers"
  on public.session_members for update
  using (public.is_session_member(session_id));

create policy "session_members_delete_peers"
  on public.session_members for delete
  using (public.is_session_member(session_id));

-- pins ----------------------------------------------------------------------

create policy "pins_all_members"
  on public.pins for all
  using (public.is_session_member(session_id))
  with check (public.is_session_member(session_id));

-- alerts ----------------------------------------------------------------------

create policy "alerts_all_members"
  on public.alerts for all
  using (public.is_session_member(session_id))
  with check (public.is_session_member(session_id));

-- check_ins -------------------------------------------------------------------

create policy "check_ins_all_members"
  on public.check_ins for all
  using (public.is_session_member(session_id))
  with check (public.is_session_member(session_id));

-- ============================================================================
-- Realtime
-- ============================================================================

alter publication supabase_realtime add table public.session_members;
alter publication supabase_realtime add table public.alerts;
alter publication supabase_realtime add table public.check_ins;
