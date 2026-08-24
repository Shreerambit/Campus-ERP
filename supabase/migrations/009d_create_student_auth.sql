-- =====================================================================
--  009d — Create Supabase auth users for all 244 students (batch)
--  ---------------------------------------------------------------------
--  ⚠️ IMPORTANT: This inserts directly into `auth.users` with a bcrypt
--  hashed password. Supabase normally goes through GoTrue; direct inserts
--  work but bypass extra hooks. For production, use the Admin API.
--
--  Password  = student's DOB (yyyy-mm-dd) — students change it on first login.
--  Email     = <lowercased reg_no>@<college_id>.student.local  (shadow email)
--
--  Run AFTER 009a (students seeded) and 007_teachers_username.sql (extension).
-- =====================================================================

-- Ensure pgcrypto is available for gen_random_uuid + crypt
create extension if not exists "pgcrypto";

-- For every active student who doesn't have an auth account yet, create one.
do $$
declare
  st  record;
  new_uid uuid;
  shadow  text;
  pwd     text;
begin
  for st in
    select id, college_id, reg_no, name, dob, personal_email
      from public.students
     where college_id = '11111111-1111-1111-1111-111111111111'
       and auth_user_id is null
       and dob is not null
  loop
    shadow  := lower(st.reg_no) || '@' || st.college_id || '.student.local';
    pwd     := to_char(st.dob, 'YYYY-MM-DD');
    new_uid := gen_random_uuid();

    -- Insert directly into auth.users (schema is stable across Supabase versions).
    -- Skip if this shadow email is already taken.
    if not exists (select 1 from auth.users where email = shadow) then
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token, email_change_token_new,
        email_change, is_super_admin
      ) values (
        new_uid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        shadow,
        crypt(pwd, gen_salt('bf')),
        now(),
        jsonb_build_object('provider','email','providers',array['email']),
        jsonb_build_object('role','student','full_name', st.name, 'reg_no', st.reg_no),
        now(), now(), '', '', '', '', false
      );

      -- Link the student row to this auth user
      update public.students set auth_user_id = new_uid where id = st.id;

      -- Ensure the profile has role='student' + college_id
      insert into public.profiles (id, role, full_name, college_id)
      values (new_uid, 'student', st.name, st.college_id)
      on conflict (id) do update set role='student', full_name=excluded.full_name, college_id=excluded.college_id;
    end if;
  end loop;
end $$;

-- =====================================================================
--  Log summary
-- =====================================================================
do $$
declare
  n_total int;
  n_linked int;
begin
  select count(*) into n_total   from public.students where college_id = '11111111-1111-1111-1111-111111111111';
  select count(*) into n_linked  from public.students where college_id = '11111111-1111-1111-1111-111111111111' and auth_user_id is not null;
  raise notice 'Total students: %  |  With auth accounts: %', n_total, n_linked;
end $$;
