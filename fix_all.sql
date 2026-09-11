-- =====================================================================
--  CAMPUS ERP — ONE-SHOT FIX
--  1) Fix teachers.assigned_subjects to use BVVS- prefixed codes
--  2) Merge duplicate subject rows (old SE/DA/MAD/IT → BVVS-SE/BVVS-DA/BVVS-MAD/BVVS-IT)
--  3) Nuclear-reset Praveen's auth login (username: praveen / password: teacherpraveen)
--  4) Mark all teachers as password_changed=true (no forced-change loop)
--
--  RUN THIS IN SUPABASE SQL EDITOR → https://supabase.com/dashboard/project/nzxbitngtkjeduwhueks/sql
--  COPY-PASTE THE WHOLE BLOCK, HIT "Run". PASTE THE FULL OUTPUT BACK TO ME.
-- =====================================================================

-- ---------- CONFIG ----------
do $$
declare
  v_college  uuid := '11111111-1111-1111-1111-111111111111';
  v_dept     uuid := 'aaaaaaaa-0001-0000-0000-000000000001';
  v_praveen_email text := 'praveen@11111111-1111-1111-1111-111111111111.teacher.local';
  v_praveen_pwd   text := 'teacherpraveen';
  v_uid uuid;
begin

  -- ============================================================
  -- STEP 1: Fix assigned_subjects on teachers (SE → BVVS-SE etc.)
  -- ============================================================
  update public.teachers
     set assigned_subjects = array['BVVS-SE']::text[]
   where college_id = v_college
     and lower(username) = 'praveen'
     and assigned_subjects::text like '%SE%'
     and assigned_subjects::text not like '%BVVS-SE%';

  update public.teachers
     set assigned_subjects = array['BVVS-DA']::text[]
   where college_id = v_college
     and lower(username) = 'naina'
     and (assigned_subjects::text like '%DA%' or assigned_subjects is null)
     and assigned_subjects::text not like '%BVVS-DA%';

  update public.teachers
     set assigned_subjects = array['BVVS-MAD']::text[]
   where college_id = v_college
     and lower(username) = 'neelkanth'
     and (assigned_subjects::text like '%MAD%' or assigned_subjects is null)
     and assigned_subjects::text not like '%BVVS-MAD%';

  update public.teachers
     set assigned_subjects = array['BVVS-IT']::text[]
   where college_id = v_college
     and lower(username) = 'akshat'
     and (assigned_subjects::text like '%IT%' or assigned_subjects is null)
     and assigned_subjects::text not like '%BVVS-IT%';

  raise notice '✅ Step 1: Teachers assigned_subjects normalized to BVVS- codes.';

  -- ============================================================
  -- STEP 2: Merge duplicate subjects (migrate refs, delete olds)
  -- ============================================================
  --
  -- For each pair (old_code, new_code):
  --   1. Move all referencing rows (attendance, marks, assignments,
  --      study_materials, teacher_assignments, timetable) to the new id.
  --   2. Delete the old subject row.
  --   (We do it in a loop so it's idempotent.)

  declare
    r record;
    v_old_id uuid;
    v_new_id uuid;
  begin
    for r in
      select unnest(array['DA','IT','MAD','SE'])           as old_code,
             unnest(array['BVVS-DA','BVVS-IT','BVVS-MAD','BVVS-SE']) as new_code
    loop
      -- Locate the new (BVVS- prefixed) subject
      select id into v_new_id
        from public.subjects
       where college_id = v_college
         and code = r.new_code
         and semester = 5
       limit 1;

      -- Locate the old unprefixed subject (sem 5 only)
      select id into v_old_id
        from public.subjects
       where college_id = v_college
         and code = r.old_code
         and semester = 5
       limit 1;

      if v_old_id is null then
        raise notice '– No old subject "%" found (nothing to migrate).', r.old_code;
        continue;
      end if;

      if v_new_id is null then
        -- If BVVS- variant doesn't exist yet, just rename the old one in place.
        update public.subjects
           set code = r.new_code
         where id = v_old_id;
        raise notice '⚠️  No BVVS variant for "%", renamed existing row → "%".', r.old_code, r.new_code;
        continue;
      end if;

      -- Both exist → MIGRATE REFERENCES, then delete old.
      -- attendance (FK: on delete cascade, so we MUST repoint or we lose data)
      update public.attendance
         set subject_id = v_new_id
       where subject_id = v_old_id
         and college_id = v_college;

      -- marks
      update public.marks
         set subject_id = v_new_id
       where subject_id = v_old_id
         and college_id = v_college;

      -- assignments
      update public.assignments
         set subject_id = v_new_id
       where subject_id = v_old_id
         and college_id = v_college;

      -- study_materials (notes / PDFs)
      begin
        execute 'update public.study_materials set subject_id = $1 where subject_id = $2 and college_id = $3'
          using v_new_id, v_old_id, v_college;
      exception when undefined_table then null;
      end;

      -- teacher_assignments
      update public.teacher_assignments
         set subject_id = v_new_id
       where subject_id = v_old_id;

      -- timetable (FK: on delete set null — repoint to preserve timetable)
      update public.timetable
         set subject_id = v_new_id
       where subject_id = v_old_id
         and college_id = v_college;

      -- Handle any unique-constraint collisions on the pivot tables
      -- (teacher_assignments has unique(teacher_id, subject_id, section_id))
      delete from public.teacher_assignments a
       where a.subject_id = v_old_id
         and exists (
           select 1 from public.teacher_assignments b
            where b.teacher_id = a.teacher_id
              and b.subject_id = v_new_id
              and b.section_id is not distinct from a.section_id
         );
      update public.teacher_assignments
         set subject_id = v_new_id
       where subject_id = v_old_id;

      -- De-dupe attendance unique (student_id, subject_id, taken_on): keep new, drop old duplicates
      delete from public.attendance a
       where a.subject_id = v_old_id
         and exists (
           select 1 from public.attendance b
            where b.student_id = a.student_id
              and b.subject_id = v_new_id
              and b.taken_on = a.taken_on
         );
      update public.attendance
         set subject_id = v_new_id
       where subject_id = v_old_id;

      -- De-dupe marks
      delete from public.marks a
       where a.subject_id = v_old_id
         and exists (
           select 1 from public.marks b
            where b.student_id = a.student_id
              and b.subject_id = v_new_id
              and b.kind = a.kind
         );
      update public.marks
         set subject_id = v_new_id
       where subject_id = v_old_id;

      -- De-dupe assignments
      delete from public.assignments a
       where a.subject_id = v_old_id
         and exists (
           select 1 from public.assignments b
            where b.college_id = a.college_id
              and b.section_id is not distinct from a.section_id
              and b.subject_id = v_new_id
              and b.title = a.title
         );
      update public.assignments
         set subject_id = v_new_id
       where subject_id = v_old_id;

      -- De-dupe study_materials
      begin
        delete from public.study_materials a
         where a.subject_id = v_old_id
           and exists (
             select 1 from public.study_materials b
              where b.college_id = a.college_id
                and b.subject_id = v_new_id
                and b.title = a.title
           );
        execute 'update public.study_materials set subject_id = $1 where subject_id = $2'
          using v_new_id, v_old_id;
      exception when undefined_table then null;
      end;

      -- De-dupe timetable unique
      delete from public.timetable a
       where a.subject_id = v_old_id
         and exists (
           select 1 from public.timetable b
            where b.college_id = a.college_id
              and b.section_id = a.section_id
              and b.day_of_week = a.day_of_week
              and b.start_time = a.start_time
              and b.subject_id = v_new_id
         );
      update public.timetable
         set subject_id = v_new_id
       where subject_id = v_old_id;

      -- Finally: delete the old duplicate subject
      delete from public.subjects where id = v_old_id;
      raise notice '✅ Merged subject "%" → "%", deleted old row.', r.old_code, r.new_code;
    end loop;
  end;

  raise notice '✅ Step 2: Subject duplicates cleaned up.';

  -- ============================================================
  -- STEP 3: Nuclear-reset PRAVEEN auth (username: praveen, pwd: teacherpraveen)
  -- ============================================================
  begin
    -- Unlink any stale teacher rows from the auth user(s) we're about to delete.
    update public.teachers
       set auth_user_id = null
     where college_id = v_college
       and lower(username) = 'praveen';

    -- Nuke any existing auth.identities / auth.users rows that look like praveen.
    delete from auth.identities
     where user_id in (select id from auth.users where email ilike '%praveen%' || v_college::text || '%'
                       union select id from auth.users where email = v_praveen_email);
    delete from auth.users
     where email ilike '%praveen%' || v_college::text || '%'
        or email = v_praveen_email;

    -- Create fresh auth user
    insert into auth.users (
      id, instance_id, aud, role, email,
      encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmed_at, last_sign_in_at
    ) values (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      v_praveen_email,
      crypt(v_praveen_pwd, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('role','teacher','full_name','Sri. Praveen Akkimaradi','username','praveen'),
      now(), now(), now(), now()
    ) returning id into v_uid;

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', v_praveen_email),
      'email', v_uid::text,
      now(), now(), now()
    ) on conflict do nothing;

    insert into public.profiles (id, role, college_id, full_name, photo_url)
    values (v_uid, 'teacher', v_college, 'Sri. Praveen Akkimaradi', null)
    on conflict (id) do update set
      role = 'teacher',
      college_id = v_college,
      full_name = 'Sri. Praveen Akkimaradi';

    update public.teachers
       set auth_user_id     = v_uid,
           email            = v_praveen_email,
           password_changed = false,
           status           = 'active',
           name             = 'Sri. Praveen Akkimaradi'
     where college_id = v_college
       and lower(username) = 'praveen';

    raise notice '✅ Step 3: Praveen auth recreated. uid=%', v_uid;
  exception when others then
    raise warning '⚠️  Step 3 issue: % %', SQLERRM, SQLSTATE;
  end;

  -- ============================================================
  -- STEP 4: Make sure all 4 teachers have password_changed = true
  --         (avoids "please change password" loop)
  -- ============================================================
  update public.teachers
     set password_changed = true,
         status = 'active'
   where college_id = v_college
     and lower(username) in ('praveen','naina','neelkanth','akshat');

  raise notice '✅ Step 4: All 4 teachers marked active + password_changed=true.';
  raise notice '==================================================';
  raise notice '🎉 DONE. Praveen login:  username=praveen  password=teacherpraveen';
  raise notice '==================================================';
end $$;


-- =====================================================================
--  VERIFICATION — run this too (it will print a nice table).
-- =====================================================================
select '→ Teachers' as section;
select username, name, status, password_changed,
       auth_user_id is not null as has_auth_link,
       assigned_subjects
  from public.teachers
 where college_id = '11111111-1111-1111-1111-111111111111'
 order by username;

select '→ Subjects (Sem 5)' as section;
select code, name, semester, id::text
  from public.subjects
 where college_id = '11111111-1111-1111-1111-111111111111'
   and semester = 5
 order by code;

select '→ Praveen auth diagnostic' as section;
select t.username, t.status, t.email,
       u.id is not null           as auth_user_exists,
       u.email_confirmed_at is not null as email_confirmed,
       u.encrypted_password is not null as has_password,
       i.id is not null           as has_identity,
       p.role                     as profile_role,
       p.college_id is not null   as profile_has_college
  from public.teachers t
  left join auth.users       u on u.id = t.auth_user_id
  left join auth.identities  i on i.user_id = u.id
  left join public.profiles  p on p.id = t.auth_user_id
 where t.college_id = '11111111-1111-1111-1111-111111111111'
   and lower(t.username) = 'praveen';
