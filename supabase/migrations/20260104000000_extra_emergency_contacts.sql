-- Tether, extra emergency contacts on profiles (approved data-model change).
-- emergency_contact_name/phone stay as the primary contact; this holds any
-- additional ones as [{ "name": "...", "phone": "..." }, ...]. They're offered
-- as guardian picks when starting or joining a night out.

alter table public.profiles
  add column if not exists additional_emergency_contacts jsonb not null default '[]'::jsonb;
