-- =====================================================================
--  FIX TIMETABLE + RE-ADD PRAVEEN
--  Run in Supabase SQL Editor → https://supabase.com/dashboard/project/nzxbitngtkjeduwhueks/sql
--  This fixes:
--    1. Subject names showing "—" (broken subject_id references)
--    2. "Room Room 204" double-text bug
--    3. Praveen missing from SE slots (re-links timetable)
-- =====================================================================

do $$
declare
  v_college  uuid := '11111111-1111-1111-1111-111111111111';
  v_dept     uuid := 'aaaaaaaa-0001-0000-0000-000000000001';
  v_course   uuid := 'bbbbbbbb-0001-0000-0000-000000000001';
  v_p_email  text := 'praveen@11111111-1111-1111-1111-111111111111.teacher.local';
  v_tid      uuid;
  r record;
  v_old uuid; v_new uuid;
begin

  -- ===== 1) Make sure all 4 BVVS-* subjects exist for Sem 5 =====
  insert into public.subjects (college_id, department_id, code, name, semester, credits) values
    (v_college, v_dept, 'BVVS-DA',  'Data Analytics',                 5, 4),
    (v_college, v_dept, 'BVVS-IT',  'Internet Technology',            5, 4),
    (v_college, v_dept, 'BVVS-MAD', 'Mobile Application Development', 5, 4),
    (v_college, v_dept, 'BVVS-SE',  'Software Engineering',           5, 4)
  on conflict (college_id, code) do update set
    name = excluded.name, semester = excluded.semester;

  -- ===== 2) Repoint timetable rows pointing at old SE/DA/MAD/IT to BVVS-* =====
  for r in
    select unnest(array['DA','IT','MAD','SE']) as old_code,
           unnest(array['BVVS-DA','BVVS-IT','BVVS-MAD','BVVS-SE']) as new_code
  loop
    select id into v_new from public.subjects where college_id=v_college and code=r.new_code and semester=5 limit 1;
    for v_old in select id from public.subjects where college_id=v_college and code=r.old_code and semester=5 loop
      -- De-dupe timetable unique (section_id, day, start)
      delete from public.timetable a
       where a.subject_id = v_old and a.college_id = v_college
         and exists (select 1 from public.timetable b
                      where b.college_id=a.college_id and b.section_id=a.section_id
                        and b.day_of_week=a.day_of_week and b.start_time=a.start_time
                        and b.subject_id=v_new);
      update public.timetable set subject_id=v_new where subject_id=v_old and college_id=v_college;

      -- attendance
      delete from public.attendance a
       where a.subject_id=v_old and a.college_id=v_college
         and exists (select 1 from public.attendance b
                      where b.student_id=a.student_id and b.taken_on=a.taken_on
                        and b.subject_id=v_new);
      update public.attendance set subject_id=v_new where subject_id=v_old and college_id=v_college;

      -- marks
      delete from public.marks a
       where a.subject_id=v_old and a.college_id=v_college
         and exists (select 1 from public.marks b
                      where b.student_id=a.student_id and b.kind=a.kind
                        and b.subject_id=v_new);
      update public.marks set subject_id=v_new where subject_id=v_old and college_id=v_college;

      -- assignments
      delete from public.assignments a
       where a.subject_id=v_old and a.college_id=v_college
         and exists (select 1 from public.assignments b
                      where b.college_id=a.college_id and b.section_id is not distinct from a.section_id
                        and b.title=a.title and b.subject_id=v_new);
      update public.assignments set subject_id=v_new where subject_id=v_old and college_id=v_college;

      -- teacher_assignments
      delete from public.teacher_assignments a
       where a.subject_id=v_old
         and exists (select 1 from public.teacher_assignments b
                      where b.teacher_id=a.teacher_id and b.section_id is not distinct from a.section_id
                        and b.subject_id=v_new);
      update public.teacher_assignments set subject_id=v_new where subject_id=v_old;

      -- study_materials (notes)
      begin
        execute 'delete from public.study_materials a where a.subject_id=$1 and a.college_id=$2 and exists (select 1 from public.study_materials b where b.college_id=a.college_id and b.title=a.title and b.subject_id=$3)'
          using v_old, v_college, v_new;
        execute 'update public.study_materials set subject_id=$1 where subject_id=$2 and college_id=$3'
          using v_new, v_old, v_college;
      exception when undefined_table then null; end;

      delete from public.subjects where id=v_old;
      raise notice 'Merged % → %', r.old_code, r.new_code;
    end loop;
  end loop;

  -- ===== 3) Fix "Room Room 204" → strip "Room " prefix if already stored =====
  update public.timetable
     set room = btrim(regexp_replace(room, '^(Room\s+)+', '', 'i'))
   where college_id = v_college
     and room is not null
     and room ilike 'Room%';
  raise notice 'Fixed room text.';

  -- ===== 4) Find or create Praveen teacher row =====
  select id into v_tid from public.teachers
   where college_id=v_college and lower(username)='praveen';

  if v_tid is null then
    insert into public.teachers
      (college_id, department_id, emp_id, username, name, email,
       password_changed, status, assigned_courses, assigned_semesters,
       assigned_sections, assigned_subjects)
    values
      (v_college, v_dept, 'PRAVEEN', 'praveen', 'Sri. Praveen Akkimaradi', v_p_email,
       false, 'active', '{BCA}'::text[], '{5}'::int[],
       '{A,B}'::text[], array['BVVS-SE']::text[])
    returning id into v_tid;
    raise notice 'Created Praveen teacher row id=%', v_tid;
  else
    update public.teachers
       set department_id     = v_dept,
           name             = 'Sri. Praveen Akkimaradi',
           email            = v_p_email,
           status           = 'active',
           assigned_subjects= array['BVVS-SE']::text[],
           assigned_sections= '{A,B}'::text[]
     where id = v_tid;
    raise notice 'Found Praveen teacher row id=%', v_tid;
  end if;

  -- If Praveen's auth user already exists in auth.users, link it
  update public.teachers
     set auth_user_id = (select id from auth.users where email = v_p_email limit 1)
   where id = v_tid
     and exists (select 1 from auth.users where email = v_p_email);

  update public.profiles
     set role = 'teacher', college_id = v_college, full_name = 'Sri. Praveen Akkimaradi'
   where id = (select auth_user_id from public.teachers where id = v_tid);

  -- ===== 5) Link all BVVS-SE Sem 5 timetable slots to Praveen =====
  update public.timetable tt
     set teacher_id = v_tid
    from public.sections sec, public.subjects sub
   where tt.college_id = v_college
     and tt.section_id = sec.id
     and sec.course_id = v_course and sec.semester = 5
     and tt.subject_id = sub.id
     and sub.code = 'BVVS-SE';
  raise notice 'Timetable SE slots linked to Praveen.';

  raise notice '==================================================';
  raise notice '✅ DONE. Praveen teacher row ready.';
  raise notice '   Now create Praveen in Supabase Dashboard → Auth → Add User:';
  raise notice '   Email:    %', v_p_email;
  raise notice '   Password: teacherpraveen';
  raise notice '   ☑️ Auto Confirm User';
  raise notice '   Then run the RELINK query below once.';
  raise notice '==================================================';
end $$;


-- =====================================================================
--  AFTER you create Praveen via Dashboard Auth → Add User,
--  run THIS to link the auth user to the teacher row (no ID to copy!):
-- =====================================================================
do $$
declare v_email text := 'praveen@11111111-1111-1111-1111-111111111111.teacher.local';
declare v_college uuid := '11111111-1111-1111-1111-111111111111';
declare v_uid uuid;
begin
  select id into v_uid from auth.users where email = v_email;
  if v_uid is null then
    raise warning '⚠️  Praveen auth user not found. Create him in Dashboard first (Add User → Auto Confirm).';
    return;
  end if;

  insert into public.profiles (id, role, college_id, full_name)
  values (v_uid, 'teacher', v_college, 'Sri. Praveen Akkimaradi')
  on conflict (id) do update set role='teacher', college_id=v_college, full_name='Sri. Praveen Akkimaradi';

  update public.teachers
     set auth_user_id = v_uid,
         password_changed = true
   where college_id = v_college and lower(username) = 'praveen';

  raise notice '✅ Linked auth user → teacher. Login with praveen / teacherpraveen';
end $$;


-- =====================================================================
--  VERIFY
-- =====================================================================
select '→ Subjects (Sem 5) — should show only BVVS-*' as section;
select code, name from public.subjects where college_id='11111111-1111-1111-1111-111111111111' and semester=5 order by code;

select '→ Teachers' as section;
select username, name, status, auth_user_id is not null as auth_linked, assigned_subjects from public.teachers
 where college_id='11111111-1111-1111-1111-111111111111' order by username;

select '→ Timetable Section A (should have subject + teacher names, no "Room Room")' as section;
select case tt.day_of_week when 1 then 'Mon' when 2 then 'Tue' when 3 then 'Wed'
                           when 4 then 'Thu' when 5 then 'Fri' when 6 then 'Sat' end as day,
       to_char(tt.start_time,'HH24:MI') as start, sub.code, sub.name as subject,
       coalesce(tch.name,'(no teacher)') as teacher, coalesce(tt.room,'') as room
  from public.timetable tt
  join public.sections sec on sec.id=tt.section_id
  join public.subjects sub on sub.id=tt.subject_id
  left join public.teachers tch on tch.id=tt.teacher_id
 where tt.college_id='11111111-1111-1111-1111-111111111111'
   and sec.course_id='bbbbbbbb-0001-0000-0000-000000000001' and sec.semester=5 and sec.section='A'
 order by tt.day_of_week, tt.start_time;
