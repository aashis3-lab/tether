-- Tether, profile pictures.
--
-- Data-model change (requested): profiles.avatar_url (public URL, optional;
-- the app falls back to initials). Images live in a public-read Storage
-- bucket "avatars", one folder per user: avatars/<user id>/avatar.jpg.
-- Anyone can view; only the owner can upload / replace / delete in their folder.

alter table public.profiles add column if not exists avatar_url text;

-- Bucket (public read, 5 MB cap, images only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Join preview ("Is this your group?") now also returns member pictures,
-- in the same order as member_names.
drop function if exists public.session_preview(text);

create function public.session_preview(p_join_code text)
returns table (
  session_id uuid,
  creator_name text,
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

revoke all on function public.session_preview(text) from public;
grant execute on function public.session_preview(text) to authenticated;
