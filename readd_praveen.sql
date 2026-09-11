-- =====================================================================
--  RE-ADD TEACHER "PRAVEEN" + RESTORE TIMETABLE
--  Run in: https://supabase.com/dashboard/project/nzxbitngtkjeduwhueks/sql
--  Result: login username = praveen, password = teacherpraveen
--          subject = SE (Software Engineering), sections = A & B
--          all his old timetable slots show his name again
-- =====================================================================

do $$
declare
  v_college   uuid := '11111111-1111-1111-1111-111111111111';
  v_dept      uuid := 'aaaaaaaa-0001-0000-0000-000000000001';
  v_course    uuid := 'bbbbbbbb-0001-0000-0000-000000000001';
  v_email     text := 'praveen@11111111-1111-1111-1111-111111111111.teacher.local';
  v_password  text := 'teacherpraveen';
  v_uid       uuid;
  v_teacher_id uuid;
begin

  -- =========================================================
  -- STEP 1: Clean up any old dangling auth for praveen
  -- =========================================================
  delete from auth.identities
   where user_id in (select id from auth.users where email = v_email);
  delete from auth.users where email = v_email;
  delete from public.profiles
   where id in (select id from auth.users where email = v_email);
  -- (If any stray teacher row exists with same username, remove it too)
  delete from public.teachers
   where college_id = v_college and lower(username) = 'praveen';

  -- =========================================================
  -- STEP 2: Create fresh auth.users row
  -- =========================================================
  insert into auth.users (
    id, instance_id, aud, role, email,
    encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    is_sso_user, is_anonymous,
    created_at, updated_at, confirmed_at, last_sign_in_at
  ) values (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    v_email,
    crypt(v_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'role','teacher',
      'full_name','Sri. Praveen Akkimaradi',
      'username','praveen'
    ),
    false, false,
    now(), now(), now(), now()
  ) returning id into v_uid;

  raise notice '✅ Created auth user uid=%', v_uid;

  -- =========================================================
  -- STEP 3: Create auth.identities row (required for email login)
  -- =========================================================
  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email),
    'email', v_uid::text,
    now(), now(), now()
  );

  -- =========================================================
  -- STEP 4: Create / link public.profiles
  -- =========================================================
  insert into public.profiles (id, role, college_id, full_name, created_at, updated_at)
  values (v_uid, 'teacher', v_college, 'Sri. Praveen Akkimaradi', now(), now());

  -- =========================================================
  -- STEP 5: Insert the teacher row (BVVS-SE subject, Sections A+B)
  -- =========================================================
  insert into public.teachers (
    auth_user_id, college_id, department_id,
    emp_id, username, name, email,
    password_changed, status,
    assigned_courses, assigned_semesters,
    assigned_sections, assigned_subjects,
    created_at
  ) values (
    v_uid, v_college, v_dept,
    'PRAVEEN', 'praveen', 'Sri. Praveen Akkimaradi', v_email,
    true, 'active',
    '{BCA}'::text[], '{5}'::int[],
    '{A,B}'::text[], array['BVVS-SE']::text[],
    now()
  ) returning id into v_teacher_id;

  raise notice '✅ Created teacher row id=%', v_teacher_id;

  -- =========================================================
  -- STEP 6: Restore timetable — link ALL BVVS-SE slots in Sem 5
  --         (Sections A & B) back to Praveen.
  --         Matches either 'SE' or 'BVVS-SE' code to be safe.
  -- =========================================================
  update public.timetable tt
     set teacher_id = v_teacher_id
    from public.sections sec,
         public.subjects sub
   where tt.college_id = v_college
     and tt.section_id = sec.id
     and sec.course_id = v_course
     and sec.semester = 5
     and tt.subject_id = sub.id
     and sub.code in ('SE', 'BVVS-SE')
     and tt.college_id = sub.college_id;

  -- =========================================================
  -- STEP 7: (Best-effort) Relink past attendance records that
  --         were taken for SE / BVVS-SE and had taken_by
  --         cleared when Praveen was deleted. We match on
  --         subject = SE/BVVS-SE and a null taken_by.
  -- =========================================================
  update public.attendance a
     set taken_by = v_teacher_id
    from public.subjects sub
   where a.college_id = v_college
     and a.subject_id = sub.id
     and sub.code in ('SE','BVVS-SE')
     and a.taken_by is null;

  raise notice '✅ Timetable + attendance relinked to new teacher row.';
  raise notice '==================================================';
  raise notice '🎉 PRAVEEN READY';
  raise notice '   Username: praveen';
  raise notice '   Password: teacherpraveen';
  raise notice '==================================================';
end $$;


-- =====================================================================
--  VERIFICATION — will show you 3 result tables.
-- =====================================================================

select '→ Praveen teacher row' as section;
select t.id::text, t.username, t.name, t.status, t.password_changed,
       t.auth_user_id is not null as auth_linked,
       t.assigned_subjects, t.assigned_sections
  from public.teachers t
 where t.college_id = '11111111-1111-1111-1111-111111111111'
   and lower(t.username) = 'praveen';

select '→ Praveen auth check' as section;
select u.email,
       u.email_confirmed_at is not null as email_confirmed,
       u.encrypted_password is not null as has_password,
       (select count(*) from auth.identities i where i.user_id=u.id) as identity_rows,
       p.role, p.college_id is not null as has_college
  from public.teachers t
  join auth.users u on u.id = t.auth_user_id
  left join public.profiles p on p.id = t.auth_user_id
 where t.college_id = '11111111-1111-1111-1111-111111111111'
   and lower(t.username) = 'praveen';

select '→ Timetable slots now owned by Praveen (should be ~9-11 rows)' as section;
select sec.section,
       case tt.day_of_week
         when 1 then 'Mon' when 2 then 'Tue' when 3 then 'Wed'
         when 4 then 'Thu' when 5 then 'Fri' when 6 then 'Sat'
       end as day,
       to_char(tt.start_time, 'HH24:MI') || '-' || to_char(tt.end_time, 'HH24:MI') as slot,
       sub.code as subject,
       coalesce(tch.name, '(no teacher)') as teacher,
       tt.room
  from public.timetable tt
  join public.sections  sec on sec.id = tt.section_id
  join public.subjects  sub on sub.id = tt.subject_id
  left join public.teachers tch on tch.id = tt.teacher_id
 where tt.college_id = '11111111-1111-1111-1111-111111111111'
   and sec.course_id = 'bbbbbbbb-0001-0000-0000-000000000001'
   and sec.semester = 5
   and sub.code in ('SE','BVVS-SE')
 order by sec.section, tt.day_of_week, tt.start_time;
