-- =====================================================================
--  ONE-SHOT DB REPAIR — RUN ONCE IN SUPABASE SQL EDITOR
--  Fixes teacher identity linking for ALL teachers (not just Praveen).
--  Safe to run repeatedly.
-- =====================================================================

-- 1. Link any teacher rows missing auth_user_id to the matching auth.users
--    by matching shadow email <username>@<college_id>.teacher.local
with matched as (
  select t.id as tid, au.id as uid
    from public.teachers t
    join auth.users au
      on lower(au.email) = lower(t.username) || '@' || t.college_id::text || '.teacher.local'
   where t.auth_user_id is null
)
update public.teachers t
   set auth_user_id = m.uid
  from matched m
 where t.id = m.tid;

-- 2. Ensure profiles exist for every teacher, with role='teacher' + college_id
insert into public.profiles (id, role, college_id, full_name, updated_at)
select t.auth_user_id, 'teacher'::public.user_role, t.college_id, t.name, now()
  from public.teachers t
 where t.auth_user_id is not null
on conflict (id) do update set
  role       = 'teacher',
  college_id = coalesce(public.profiles.college_id, excluded.college_id),
  full_name  = coalesce(public.profiles.full_name, excluded.full_name),
  updated_at = now();

-- 3. Correct any profile that accidentally got role='student' for a teacher
update public.profiles p
   set role = 'teacher', updated_at = now()
  from public.teachers t
 where t.auth_user_id = p.id
   and p.role is distinct from 'teacher';

-- 4. Ensure all teachers are active
update public.teachers
   set status = 'active'
 where status is null or status = '';

-- =====================================================================
--  VERIFICATION
-- =====================================================================
select 'Teachers' as what,
       count(*) as total,
       count(*) filter (where auth_user_id is not null) as linked,
       count(*) filter (where status='active') as active
  from public.teachers
 where college_id='11111111-1111-1111-1111-111111111111';

select 'Profiles' as what, count(*) as teacher_profiles
  from public.profiles
 where college_id='11111111-1111-1111-1111-111111111111'
   and role='teacher';
