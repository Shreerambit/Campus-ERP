-- =====================================================================
--  Migration 016 — Fix teacher password_changed loop
--                  + Storage bucket + policies for student avatars
-- =====================================================================
--
--  Problems this fixes:
--
--   1. When a teacher logged in, changed their password, and logged in
--      again, the app kept forcing them back to the First Login screen.
--
--      Cause: `public.teachers` had no policy letting a teacher update
--      their OWN row, so the `password_changed = true` write silently
--      failed under RLS. The `password_changed` flag stayed false
--      forever, so every login was treated as the first login.
--
--      Fix: allow a teacher to update their own row (password_changed,
--      photo_url, email, phone). Admins still control everything else
--      via the existing p_teachers_admin policy.
--
--   2. Student profile-photo upload was failing because the `avatars`
--      Storage bucket didn't exist yet (or had no public-read policy).
--      Create it + attach the right policies.
--
--  Safe to re-run.
-- =====================================================================

------------------------------------------------------------
-- 1. Teachers: let a teacher update their OWN row
------------------------------------------------------------
drop policy if exists p_teachers_update_self on public.teachers;
create policy p_teachers_update_self on public.teachers
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

------------------------------------------------------------
-- 2. Storage: avatars bucket + policies
------------------------------------------------------------
-- Create the bucket if missing (public read)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Anyone (even anon) can READ avatars — needed so profile photos
-- show for everyone in the directory.
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects
  for select to public
  using (bucket_id = 'avatars');

-- Any authenticated user can UPLOAD to the avatars bucket.
-- Path convention (enforced by the app): <college_id>/<reg_no>.<ext>
drop policy if exists "avatars auth upload" on storage.objects;
create policy "avatars auth upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars');

-- Authenticated users can OVERWRITE (same path) — replaces old photo.
drop policy if exists "avatars auth update" on storage.objects;
create policy "avatars auth update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars')
  with check (bucket_id = 'avatars');

drop policy if exists "avatars auth delete" on storage.objects;
create policy "avatars auth delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars');
