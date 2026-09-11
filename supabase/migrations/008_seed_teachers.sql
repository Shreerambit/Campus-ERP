-- =====================================================================
--  OPTIONAL: seed the 4 BVVS teachers into public.teachers.
--  ---------------------------------------------------------------------
--  BEFORE running this:
--    1) In Supabase Dashboard → Authentication → Users → Add User
--       Create these 4 users (email format is a "shadow email" —
--       teachers will never type it; the app derives it from username):
--
--       praveen@11111111-1111-1111-1111-111111111111.teacher.local
--         password: teacherpraveen   ✅ Auto Confirm User
--       naina@11111111-1111-1111-1111-111111111111.teacher.local
--         password: teachernaina     ✅ Auto Confirm User
--       neelkanth@11111111-1111-1111-1111-111111111111.teacher.local
--         password: teacherneelkanth ✅ Auto Confirm User
--       akshat@11111111-1111-1111-1111-111111111111.teacher.local
--         password: teacherakshat    ✅ Auto Confirm User
--
--    2) After creating the auth users, run this SQL to (a) promote
--       their profiles to 'teacher' and (b) insert the teacher rows.
-- =====================================================================

-- Bulk-promote profiles
update public.profiles p
   set role = 'teacher',
       college_id = '11111111-1111-1111-1111-111111111111',
       full_name = case au.email
         when 'praveen@11111111-1111-1111-1111-111111111111.teacher.local'  then 'Sri. Praveen Akkimaradi'
         when 'naina@11111111-1111-1111-1111-111111111111.teacher.local'    then 'Smt. Naina Kalayanshetti'
         when 'neelkanth@11111111-1111-1111-1111-111111111111.teacher.local' then 'Sri. Neelkanth D'
         when 'akshat@11111111-1111-1111-1111-111111111111.teacher.local'    then 'Sri. Akshat Patil'
       end
  from auth.users au
 where p.id = au.id
   and au.email in (
     'praveen@11111111-1111-1111-1111-111111111111.teacher.local',
     'naina@11111111-1111-1111-1111-111111111111.teacher.local',
     'neelkanth@11111111-1111-1111-1111-111111111111.teacher.local',
     'akshat@11111111-1111-1111-1111-111111111111.teacher.local'
   );

-- Insert teacher rows
insert into public.teachers
  (auth_user_id, college_id, department_id, emp_id, username, name, email, password_changed, status,
   assigned_courses, assigned_semesters, assigned_sections, assigned_subjects)
select
  au.id,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'aaaaaaaa-0001-0000-0000-000000000001'::uuid,
  upper(split_part(au.email, '@', 1)),
  split_part(au.email, '@', 1),
  case split_part(au.email, '@', 1)
    when 'praveen'   then 'Sri. Praveen Akkimaradi'
    when 'naina'     then 'Smt. Naina Kalayanshetti'
    when 'neelkanth' then 'Sri. Neelkanth D'
    when 'akshat'    then 'Sri. Akshat Patil'
  end,
  au.email,
  false,
  'active',
  '{BCA}'::text[],
  '{5}'::int[],
  '{A,B}'::text[],
  case split_part(au.email, '@', 1)
    when 'praveen'   then '{SE}'::text[]
    when 'naina'     then '{DA}'::text[]
    when 'neelkanth' then '{MAD}'::text[]
    when 'akshat'    then '{IT}'::text[]
  end
from auth.users au
where au.email in (
  'praveen@11111111-1111-1111-1111-111111111111.teacher.local',
  'naina@11111111-1111-1111-1111-111111111111.teacher.local',
  'neelkanth@11111111-1111-1111-1111-111111111111.teacher.local',
  'akshat@11111111-1111-1111-1111-111111111111.teacher.local'
)
on conflict (college_id, emp_id) do update set
  username         = excluded.username,
  name             = excluded.name,
  email            = excluded.email,
  assigned_subjects= excluded.assigned_subjects;
