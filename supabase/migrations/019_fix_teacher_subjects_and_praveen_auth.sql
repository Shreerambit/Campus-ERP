-- =====================================================================
--  019_fix_teacher_subjects_and_praveen_auth.sql
--  ---------------------------------------------------------------------
--  1. Normalize teachers.assigned_subjects from old SE/DA/MAD/IT to
--     BVVS-SE/BVVS-DA/BVVS-MAD/BVVS-IT.
--  2. Merge duplicate subject rows (unprefixed → BVVS- prefixed) and
--     repoint all FK references so no attendance/notes/marks/timetable
--     rows are lost.
--  3. Rebuild Praveen's auth.users / auth.identities / public.profiles
--     and re-link public.teachers.auth_user_id (password: teacherpraveen).
--  4. Mark the 4 BVVS teachers active + password_changed=true.
-- =====================================================================

do $$
declare
  v_college uuid := '11111111-1111-1111-1111-111111111111';
  v_praveen_email text := 'praveen@11111111-1111-1111-1111-111111111111.teacher.local';
  v_praveen_pwd   text := 'teacherpraveen';
  v_uid uuid;
begin

  -- ---------- Fix assigned_subjects ----------
  update public.teachers
     set assigned_subjects = array['BVVS-SE']::text[]
   where college_id = v_college and lower(username)='praveen'
     and assigned_subjects::text like '%SE%'
     and assigned_subjects::text not like '%BVVS-SE%';

  update public.teachers
     set assigned_subjects = array['BVVS-DA']::text[]
   where college_id = v_college and lower(username)='naina'
     and assigned_subjects::text like '%DA%'
     and assigned_subjects::text not like '%BVVS-DA%';

  update public.teachers
     set assigned_subjects = array['BVVS-MAD']::text[]
   where college_id = v_college and lower(username)='neelkanth'
     and assigned_subjects::text like '%MAD%'
     and assigned_subjects::text not like '%BVVS-MAD%';

  update public.teachers
     set assigned_subjects = array['BVVS-IT']::text[]
   where college_id = v_college and lower(username)='akshat'
     and assigned_subjects::text like '%IT%'
     and assigned_subjects::text not like '%BVVS-IT%';

  -- ---------- Merge duplicate subjects ----------
  declare
    r record;
    v_old_id uuid; v_new_id uuid;
  begin
    for r in
      select unnest(array['DA','IT','MAD','SE']) as old_code,
             unnest(array['BVVS-DA','BVVS-IT','BVVS-MAD','BVVS-SE']) as new_code
    loop
      select id into v_new_id from public.subjects
       where college_id=v_college and code=r.new_code and semester=5 limit 1;
      select id into v_old_id from public.subjects
       where college_id=v_college and code=r.old_code and semester=5 limit 1;

      if v_old_id is null then continue; end if;
      if v_new_id is null then
        update public.subjects set code=r.new_code where id=v_old_id;
        continue;
      end if;

      -- Repoint all referencing FKs. First dedupe unique constraints, then update.

      -- teacher_assignments (unique teacher_id, subject_id, section_id)
      delete from public.teacher_assignments a
       where a.subject_id = v_old_id
         and exists (select 1 from public.teacher_assignments b
                      where b.teacher_id=a.teacher_id
                        and b.section_id is not distinct from a.section_id
                        and b.subject_id=v_new_id);
      update public.teacher_assignments set subject_id=v_new_id where subject_id=v_old_id;

      -- attendance (unique student_id, subject_id, taken_on)
      delete from public.attendance a
       where a.subject_id = v_old_id and a.college_id=v_college
         and exists (select 1 from public.attendance b
                      where b.student_id=a.student_id and b.taken_on=a.taken_on
                        and b.subject_id=v_new_id);
      update public.attendance set subject_id=v_new_id
       where subject_id=v_old_id and college_id=v_college;

      -- marks
      delete from public.marks a
       where a.subject_id=v_old_id and a.college_id=v_college
         and exists (select 1 from public.marks b
                      where b.student_id=a.student_id and b.kind=a.kind
                        and b.subject_id=v_new_id);
      update public.marks set subject_id=v_new_id
       where subject_id=v_old_id and college_id=v_college;

      -- assignments
      delete from public.assignments a
       where a.subject_id=v_old_id and a.college_id=v_college
         and exists (select 1 from public.assignments b
                      where b.college_id=a.college_id
                        and b.section_id is not distinct from a.section_id
                        and b.title=a.title and b.subject_id=v_new_id);
      update public.assignments set subject_id=v_new_id
       where subject_id=v_old_id and college_id=v_college;

      -- timetable
      delete from public.timetable a
       where a.subject_id=v_old_id and a.college_id=v_college
         and exists (select 1 from public.timetable b
                      where b.college_id=a.college_id and b.section_id=a.section_id
                        and b.day_of_week=a.day_of_week and b.start_time=a.start_time
                        and b.subject_id=v_new_id);
      update public.timetable set subject_id=v_new_id
       where subject_id=v_old_id and college_id=v_college;

      -- study_materials (created in migration 018; table may have extra cols)
      begin
        execute format(
          'delete from public.study_materials a
            where a.subject_id=$1 and a.college_id=$3
              and exists (select 1 from public.study_materials b
                           where b.college_id=a.college_id
                             and b.title=a.title
                             and b.subject_id=$2)')
          using v_old_id, v_new_id, v_college;
        execute 'update public.study_materials set subject_id=$1 where subject_id=$2 and college_id=$3'
          using v_new_id, v_old_id, v_college;
      exception when undefined_table then null; end;

      delete from public.subjects where id=v_old_id;
    end loop;
  end;

  -- ---------- Reset Praveen auth ----------
  update public.teachers set auth_user_id=null
   where college_id=v_college and lower(username)='praveen';

  delete from auth.identities
   where user_id in (select id from auth.users where email=v_praveen_email);
  delete from auth.users where email=v_praveen_email;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmed_at, last_sign_in_at
  ) values (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
    'authenticated','authenticated', v_praveen_email,
    crypt(v_praveen_pwd, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('role','teacher','full_name','Sri. Praveen Akkimaradi','username','praveen'),
    now(),now(),now(),now()
  ) returning id into v_uid;

  insert into auth.identities
    (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values
    (gen_random_uuid(), v_uid,
     jsonb_build_object('sub',v_uid::text,'email',v_praveen_email),
     'email', v_uid::text, now(), now(), now())
  on conflict do nothing;

  insert into public.profiles (id, role, college_id, full_name)
  values (v_uid, 'teacher', v_college, 'Sri. Praveen Akkimaradi')
  on conflict (id) do update
    set role='teacher', college_id=v_college, full_name='Sri. Praveen Akkimaradi';

  update public.teachers
     set auth_user_id=v_uid, email=v_praveen_email,
         password_changed=false, status='active',
         name='Sri. Praveen Akkimaradi'
   where college_id=v_college and lower(username)='praveen';

  -- ---------- Ensure teachers are active and no password loop ----------
  update public.teachers
     set password_changed=true, status='active'
   where college_id=v_college
     and lower(username) in ('praveen','naina','neelkanth','akshat');

end $$;
