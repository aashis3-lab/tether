-- Web push instead of SMS.
--
--   push_subscriptions  one row per device (browser push endpoint) per user
--   push_log            event keys already pushed, so a push goes out once
--
-- sms_outbox stays the queue for guardian messages (HELP, guardian alerts,
-- everyone home, test). The evaluate-session Edge Function now delivers each
-- row as a push to the Tether account whose profile phone matches to_phone,
-- instead of texting it. Group alerts and check-ins are pushed straight from
-- the alerts / check_ins tables.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- You can see and remove your own devices. Saving goes through
-- save_push_subscription (a shared device may switch accounts).
drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own"
  on public.push_subscriptions for select
  using (user_id = auth.uid());

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete
  using (user_id = auth.uid());

create table if not exists public.push_log (
  event_key text primary key,
  created_at timestamptz not null default now()
);

-- Service role (Edge Function) only.
alter table public.push_log enable row level security;

create index if not exists profiles_phone_idx on public.profiles (phone);

-- Registers this device for the signed-in user (moves it if another account
-- had it).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (auth.uid(), p_endpoint, p_p256dh, p_auth)
    on conflict (endpoint) do update
      set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

revoke all on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- Guardian picker hint: 'ready' (on Tether with notifications on),
-- 'no_push' (on Tether, notifications off) or 'not_on_tether'.
create or replace function public.guardian_reachability(p_phone text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select case
    when exists (
      select 1 from public.profiles p join public.push_subscriptions s on s.user_id = p.id
      where p.phone = trim(p_phone)
    ) then 'ready'
    when exists (select 1 from public.profiles p where p.phone = trim(p_phone)) then 'no_push'
    else 'not_on_tether'
  end;
$$;

revoke all on function public.guardian_reachability(text) from public, anon;
grant execute on function public.guardian_reachability(text) to authenticated;
