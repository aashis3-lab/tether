-- Real users only: escalation timers always run at real-world speed.
-- _demo_speed() used to read the tether_demo_speed Vault secret; it now
-- always returns 1, so a leftover secret can't shorten timers. The
-- p_demo_speed parameters stay for compatibility; callers pass nothing (1).

create or replace function public._demo_speed()
returns float8
language sql
immutable
as $$
  select 1::float8;
$$;

revoke all on function public._demo_speed() from public, anon, authenticated;

delete from vault.secrets where name = 'tether_demo_speed';
