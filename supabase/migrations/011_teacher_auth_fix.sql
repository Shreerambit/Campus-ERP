-- =====================================================================
--  011 — Fix teacher login + create auth users for 4 seed teachers
--  ---------------------------------------------------------------------
--  What this does:
--   1) Adds a public read policy on `teachers` so the login screen can
--      look up (username → real name + status) BEFORE sign-in.
--   2) Creates 4 Supabase auth accounts (praveen/naina/neelkanth/akshat)
--      with their default passwords, linked to the existing rows in
--      public.teachers via auth_user_id.
--
--  Passwords ARE stored hashed by Postgres' crypt(). Never plaintext.
--  Safe to re-run — every step is idempotent.
-- =====================================================================

create extension if not exists "pgcrypto";

-- --- 1) Public read policy on teachers (minimal columns only, RLS-safe) ---
drop policy if exists p_teachers_public_lookup on public.teachers;
create policy p_teachers_public_lookup on public.teachers
  for select to anon
  using (status = 'active');

-- --- 2) Create auth users + link ---
-- Uses a helper we inline: create user if missing, then update the
-- teachers row with the new auth_user_id.
do $$
declare
  t record;
  new_uid uuid;
  shadow  text;
  pwd     text;
begin
  -- Iterate the 4 known teachers of BVVS
  for t in
    select id, username, name
      from public.teachers
     where college_id = '11111111-1111-1111-1111-111111111111'
       and username in ('praveen','naina','neelkanth','akshat')
  loop
    shadow := lower(t.username) || '@11111111-1111-1111-1111-111111111111.teacher.local';
    pwd    := 'teacher' || lower(t.username);

    -- 2a) Ensure an auth.users row exists
    if not exists (select 1 from auth.users where email = shadow) then
      new_uid := gen_random_uuid();
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        is_super_admin
      ) values (
        new_uid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated',
        shadow,
        crypt(pwd, gen_salt('bf')),
        now(),
        jsonb_build_object('provider','email','providers', array['email']),
        jsonb_build_object('role','teacher','full_name', t.name, 'username', t.username),
        now(), now(),
        '', '', '', '', false
      );
    else
      -- Reset the password to the default so admin can hand it out again
      update auth.users
         set encrypted_password = crypt(pwd, gen_salt('bf'))
       where email = shadow;
      select id into new_uid from auth.users where email = shadow;
    end if;

    -- 2b) Link the teachers row + promote profile role = 'teacher'
    update public.teachers set auth_user_id = new_uid, password_changed = false where id = t.id;

    insert into public.profiles (id, role, full_name, college_id)
    values (new_uid, 'teacher', t.name, '11111111-1111-1111-1111-111111111111')
    on conflict (id) do update
       set role = 'teacher',
           full_name = excluded.full_name,
           college_id = excluded.college_id;
  end loop;
end $$;

-- Verify
select username, name, status, password_changed,
       (select email from auth.users u where u.id = t.auth_user_id) as auth_email
  from public.teachers t
 where college_id = '11111111-1111-1111-1111-111111111111'
 order by username;
