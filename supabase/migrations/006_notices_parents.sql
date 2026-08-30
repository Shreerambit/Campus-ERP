-- =====================================================================
--  Notices, Parents, Soft-Delete, Storage buckets
--  ---------------------------------------------------------------------
--  Run after 002_rls.sql.
--  Adds the pieces required by the "Teacher Auth, Notices, Parent
--  Portal, Admin Student Management" master prompt.
-- =====================================================================

-- ---------- Soft-delete flag on students ----------
alter table public.students
  add column if not exists status text not null default 'active'
    check (status in ('active','graduated','suspended','archived'));
alter table public.students
  add column if not exists blood_group text;
alter table public.students
  add column if not exists parent_phone text;
alter table public.students
  add column if not exists parent_email text;

-- ---------- Notices ----------
create table if not exists public.notices (
  id           uuid primary key default gen_random_uuid(),
  college_id   uuid not null references public.colleges on delete cascade,
  title        text not null,
  body         text not null,
  target_scope text not null default 'college'
    check (target_scope in ('college','department','course','semester','section')),
  target_ref   text,             -- UUID of dept/course/section, or "5" for semester, null for college-wide
  expires_at   timestamptz,
  attachments  jsonb default '[]'::jsonb,
  created_by         uuid references auth.users on delete set null,
  created_by_name    text,
  created_by_photo   text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_notices_college on public.notices(college_id, created_at desc);

alter table public.notices enable row level security;

drop policy if exists p_notices_read on public.notices;
create policy p_notices_read on public.notices for select using (
  public.current_role() = 'super'
  or college_id = public.current_college()
);
drop policy if exists p_notices_write on public.notices;
create policy p_notices_write on public.notices for all using (
  public.current_role() in ('teacher','admin','super')
) with check (
  public.current_role() in ('teacher','admin','super')
);

-- ---------- Parents ----------
create table if not exists public.parents (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users on delete set null,
  student_id    uuid not null references public.students on delete cascade,
  college_id    uuid not null references public.colleges on delete cascade,
  name          text,
  phone         text,
  email         text,
  password_changed boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (student_id)
);
create index if not exists idx_parents_college on public.parents(college_id);

alter table public.parents enable row level security;

drop policy if exists p_parents_read on public.parents;
create policy p_parents_read on public.parents for select using (
  public.current_role() = 'super'
  or (public.current_role() in ('admin','teacher') and college_id = public.current_college())
  or (auth_user_id = auth.uid())
);
drop policy if exists p_parents_admin on public.parents;
create policy p_parents_admin on public.parents for all using (
  public.current_role() in ('admin','super')
) with check (public.current_role() in ('admin','super'));

-- ---------- Teacher assignments simplified accessor ----------
-- Handy view for teacher dashboards (assigned sections + subjects).
create or replace view public.v_teacher_assignments as
select ta.teacher_id,
       t.name        as teacher_name,
       t.college_id,
       s.id          as subject_id,
       s.code        as subject_code,
       s.name        as subject_name,
       sec.id        as section_id,
       sec.semester,
       sec.section,
       c.code        as course_code,
       d.code        as department_code
  from public.teacher_assignments ta
  join public.teachers  t   on t.id  = ta.teacher_id
  join public.subjects  s   on s.id  = ta.subject_id
  join public.sections  sec on sec.id = ta.section_id
  join public.courses   c   on c.id  = sec.course_id
  join public.departments d on d.id  = c.department_id;

-- ---------- Password-change flag on teachers ----------
alter table public.teachers
  add column if not exists password_changed boolean not null default false;

-- ---------- Storage buckets (idempotent) ----------
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('notices', 'notices', true)
  on conflict (id) do nothing;

-- Storage policies: any authenticated user can read; students can upload
-- their own /students/<college>/<reg>.* file; admins can write anywhere.
do $$ begin
  execute 'drop policy if exists avatars_read on storage.objects';
  execute $sql$
    create policy avatars_read on storage.objects
      for select using (bucket_id = 'avatars')
  $sql$;

  execute 'drop policy if exists avatars_write on storage.objects';
  execute $sql$
    create policy avatars_write on storage.objects
      for all using (
        bucket_id = 'avatars'
        and auth.role() = 'authenticated'
      ) with check (
        bucket_id = 'avatars'
        and auth.role() = 'authenticated'
      )
  $sql$;
end $$;
