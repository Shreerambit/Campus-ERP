-- =====================================================================
--  020_fix_teacher_profile_linkage.sql
--  ---------------------------------------------------------------------
--  Root-cause fix for teacher identity:
--
--    auth.users.id → public.profiles.id → public.teachers.auth_user_id
--
--  If a teacher auth user was created via Supabase Dashboard (which
--  defaults profile.role to 'student' because no user_metadata.role is
--  set), the app could not resolve the teacher identity on login.
--
--  This migration:
--    1. Ensures every teacher shadow email has a corresponding profile
--       with role='teacher' and college_id set.
--    2. Links public.teachers.auth_user_id to the matching auth.users.id
--       (matching by shadow-email local-part == teachers.username).
--    3. Is idempotent — safe to run repeatedly.
-- =====================================================================

-- 1) Upsert profiles for every teacher row (role=teacher, college set)
insert into public.profiles (id, role, college_id, full_name, updated_at)
select t.auth_user_id,
       'teacher'::public.user_role,
       t.college_id,
       t.name,
       now()
  from public.teachers t
 where t.auth_user_id is not null
on conflict (id) do update set
  role      = 'teacher',
  college_id = coalesce(public.profiles.college_id, excluded.college_id),
  full_name = coalesce(public.profiles.full_name, excluded.full_name),
  updated_at = now();

-- 2) Backfill auth_user_id for any teacher row whose shadow email exists
--    in auth.users but the FK hasn't been set yet (e.g. Praveen after
--    Dashboard "Add user" without running linker SQL).
with matched as (
  select t.id as tid, au.id as uid
    from public.teachers t
    join auth.users au
      on au.email = lower(t.username) || '@' || t.college_id::text || '.teacher.local'
   where t.auth_user_id is null
)
update public.teachers t
   set auth_user_id = m.uid
  from matched m
 where t.id = m.tid;

-- 3) Promote the newly-linked rows to role=teacher in profiles
insert into public.profiles (id, role, college_id, full_name, updated_at)
select t.auth_user_id, 'teacher'::public.user_role, t.college_id, t.name, now()
  from public.teachers t
 where t.auth_user_id is not null
on conflict (id) do update set
  role       = 'teacher',
  college_id = coalesce(public.profiles.college_id, excluded.college_id),
  full_name  = coalesce(public.profiles.full_name, excluded.full_name),
  updated_at = now();

-- 4) Safety: any teacher-auth-created profile that accidentally got
--    role='student' (because Dashboard didn't pass user_metadata.role)
--    is corrected to 'teacher'.
update public.profiles p
   set role = 'teacher'
  from public.teachers t
 where t.auth_user_id = p.id
   and p.role is distinct from 'teacher';
