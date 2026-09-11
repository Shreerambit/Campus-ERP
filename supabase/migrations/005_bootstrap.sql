-- =====================================================================
--  Bootstrap: promote a user to Super Admin or College Admin.
--  ---------------------------------------------------------------------
--  Run this AFTER you sign the user up in Supabase Auth (Dashboard →
--  Authentication → Users → Add User).
--
--  1) Replace the email addresses below with your real ones.
--  2) Run the SQL.
-- =====================================================================

-- ⚡  Super Admin (platform owner)
update public.profiles
   set role = 'super', full_name = 'Platform Owner'
 where id = (select id from auth.users where email = 'you@example.com');

-- 🏫  College Admin (belongs to BVVS)
update public.profiles
   set role       = 'admin',
       full_name  = 'BVVS Admin',
       college_id = '11111111-1111-1111-1111-111111111111'
 where id = (select id from auth.users where email = 'bvvs-admin@example.com');

-- 👨‍🏫  Teacher (belongs to BVVS · CS department)
--     Also add a row in public.teachers so the app can find them.
update public.profiles
   set role = 'teacher', college_id = '11111111-1111-1111-1111-111111111111'
 where id = (select id from auth.users where email = 'teacher@example.com');

insert into public.teachers (auth_user_id, college_id, department_id, emp_id, name, email)
select id, '11111111-1111-1111-1111-111111111111',
       'aaaaaaaa-0001-0000-0000-000000000001',
       'BVVS-CS-101', 'Sri. Praveen Akkimaradi', 'teacher@example.com'
  from auth.users where email = 'teacher@example.com'
  on conflict (college_id, emp_id) do nothing;
