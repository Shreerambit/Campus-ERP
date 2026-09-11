-- =====================================================================
--  Teacher usernames + credential helpers
--  ---------------------------------------------------------------------
--  Adds a stable, human-friendly username to every teacher so they can
--  sign in with (username + password) instead of (employee id + email).
--
--  How it works:
--   • Admin creates a Supabase auth user with a synthetic email
--     `<username>@<college_id>.teacher.local` and a password.
--   • The `teachers.username` column stores the username directly.
--   • The frontend converts (username + college) → shadow email before
--     calling supabase.auth.signInWithPassword.
--   • password_changed defaults false; the FirstLogin flow flips it to
--     true once the teacher sets a new password.
-- =====================================================================

alter table public.teachers
  add column if not exists username text;

alter table public.teachers
  add column if not exists status text not null default 'active'
    check (status in ('active','inactive','archived'));

-- Unique username per college (case-insensitive match)
create unique index if not exists ux_teachers_username_per_college
  on public.teachers (college_id, lower(username));

-- Make sure the password-changed flag exists (in case 006 wasn't run)
alter table public.teachers
  add column if not exists password_changed boolean not null default false;

-- Additional profile fields
alter table public.teachers
  add column if not exists assigned_courses  text[] default '{}',
  add column if not exists assigned_semesters int[] default '{}',
  add column if not exists assigned_sections text[] default '{}',
  add column if not exists assigned_subjects text[] default '{}';

-- Backfill username from emp_id for any old rows (safe no-op if none exist)
update public.teachers
   set username = lower(regexp_replace(coalesce(username, emp_id), '[^a-z0-9]', '', 'gi'))
 where username is null or username = '';
