-- =====================================================================
--  CAMPUS ERP — Multi-tenant Postgres schema for Supabase
--  ---------------------------------------------------------------------
--  Idempotent. Safe to run in a clean project.
--  Includes: tables · relationships · triggers · indexes · seed
--  RLS lives in `002_rls.sql` (run right after this one).
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- --------- Roles ---------
do $$ begin
  create type public.user_role as enum ('student','teacher','admin','parent','super');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------
-- Profiles — 1:1 mirror of auth.users, holds role + tenant fk
-- ---------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  role         public.user_role not null default 'student',
  full_name    text,
  photo_url    text,
  college_id   uuid,               -- filled by triggers when the user is a student/teacher/admin
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Tenant tree: colleges → departments → courses → semesters/sections
-- ---------------------------------------------------------------
create table if not exists public.colleges (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  name        text not null,
  short_name  text,
  city        text,
  logo_letter text,
  brand_gradient text default 'from-ios-blue to-ios-indigo',
  status      text not null default 'active' check (status in ('active','suspended')),
  created_at  timestamptz not null default now()
);

create table if not exists public.departments (
  id         uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.colleges on delete cascade,
  code       text not null,
  name       text not null,
  unique (college_id, code)
);

create table if not exists public.courses (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments on delete cascade,
  code          text not null,
  name          text not null,
  unique (department_id, code)
);

create table if not exists public.sections (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses on delete cascade,
  semester   int  not null check (semester between 1 and 12),
  section    text not null,
  unique (course_id, semester, section)
);

-- ---------------------------------------------------------------
-- Subjects
-- ---------------------------------------------------------------
create table if not exists public.subjects (
  id            uuid primary key default gen_random_uuid(),
  college_id    uuid not null references public.colleges on delete cascade,
  department_id uuid references public.departments on delete set null,
  code          text not null,
  name          text not null,
  semester      int,
  credits       int not null default 3,
  unique (college_id, code)
);

-- ---------------------------------------------------------------
-- Students / teachers
-- ---------------------------------------------------------------
create table if not exists public.students (
  id             uuid primary key default gen_random_uuid(),
  auth_user_id   uuid unique references auth.users on delete set null,

  college_id     uuid not null references public.colleges     on delete cascade,
  department_id  uuid not null references public.departments  on delete restrict,
  course_id      uuid not null references public.courses      on delete restrict,
  semester       int  not null,
  section        text not null,

  reg_no         text not null,
  name           text not null,
  roll_number    int,
  dob            date,
  gender         text,

  photo_url      text,
  personal_email text,
  phone          text,
  emergency_contact text,

  admission_year int,
  academic_year  text,

  cgpa           numeric(4,2),
  sgpa           numeric(4,2),

  skills         text[]  default '{}',
  achievements   text[]  default '{}',
  badges         text[]  default '{}',

  password_changed boolean not null default false,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (college_id, reg_no)
);
create index if not exists idx_students_college on public.students(college_id);
create index if not exists idx_students_section on public.students(college_id, course_id, semester, section);
create index if not exists idx_students_reg     on public.students(college_id, reg_no);

create table if not exists public.teachers (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users on delete set null,
  college_id   uuid not null references public.colleges on delete cascade,
  department_id uuid references public.departments on delete set null,
  emp_id       text not null,
  name         text not null,
  email        text,
  phone        text,
  photo_url    text,
  created_at   timestamptz not null default now(),
  unique (college_id, emp_id)
);
create index if not exists idx_teachers_college on public.teachers(college_id);

-- Teacher ↔ Subject/Section assignments
create table if not exists public.teacher_assignments (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references public.teachers on delete cascade,
  subject_id    uuid not null references public.subjects on delete cascade,
  section_id    uuid not null references public.sections on delete cascade,
  unique (teacher_id, subject_id, section_id)
);

-- ---------------------------------------------------------------
-- Timetable, attendance, marks, results
-- ---------------------------------------------------------------
create table if not exists public.timetable (
  id           uuid primary key default gen_random_uuid(),
  college_id   uuid not null references public.colleges on delete cascade,
  section_id   uuid not null references public.sections on delete cascade,
  day_of_week  int  not null check (day_of_week between 1 and 7),
  start_time   time not null,
  end_time     time not null,
  subject_id   uuid references public.subjects on delete set null,
  teacher_id   uuid references public.teachers on delete set null,
  room         text,
  slot_type    text not null default 'Lecture' check (slot_type in ('Lecture','Lab','Tutorial'))
);
create index if not exists idx_tt_section on public.timetable(section_id, day_of_week);

create table if not exists public.attendance (
  id           uuid primary key default gen_random_uuid(),
  college_id   uuid not null references public.colleges on delete cascade,
  student_id   uuid not null references public.students on delete cascade,
  subject_id   uuid not null references public.subjects on delete cascade,
  taken_by     uuid references public.teachers on delete set null,
  taken_on     date not null default current_date,
  status       text not null check (status in ('present','absent','late','leave')),
  created_at   timestamptz not null default now(),
  unique (student_id, subject_id, taken_on)
);
create index if not exists idx_att_student on public.attendance(student_id, taken_on);
create index if not exists idx_att_college on public.attendance(college_id, taken_on);

create table if not exists public.marks (
  id           uuid primary key default gen_random_uuid(),
  college_id   uuid not null references public.colleges on delete cascade,
  student_id   uuid not null references public.students on delete cascade,
  subject_id   uuid not null references public.subjects on delete cascade,
  kind         text not null check (kind in ('internal','external','lab','practical','project')),
  score        numeric(6,2) not null,
  max_score    numeric(6,2) not null default 100,
  entered_by   uuid references public.teachers on delete set null,
  entered_at   timestamptz not null default now()
);
create index if not exists idx_marks_student on public.marks(student_id, subject_id);

create table if not exists public.results (
  id          uuid primary key default gen_random_uuid(),
  college_id  uuid not null references public.colleges on delete cascade,
  student_id  uuid not null references public.students on delete cascade,
  semester    int  not null,
  sgpa        numeric(4,2),
  cgpa        numeric(4,2),
  pdf_path    text,
  created_at  timestamptz not null default now(),
  unique (student_id, semester)
);

-- ---------------------------------------------------------------
-- Assignments · materials · library · placement
-- ---------------------------------------------------------------
create table if not exists public.assignments (
  id           uuid primary key default gen_random_uuid(),
  college_id   uuid not null references public.colleges on delete cascade,
  subject_id   uuid not null references public.subjects on delete cascade,
  section_id   uuid references public.sections on delete set null,
  title        text not null,
  description  text,
  due_at       timestamptz,
  file_path    text,
  created_by   uuid references public.teachers on delete set null,
  created_at   timestamptz not null default now()
);
create table if not exists public.assignment_submissions (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments on delete cascade,
  student_id    uuid not null references public.students    on delete cascade,
  file_path     text,
  submitted_at  timestamptz not null default now(),
  score         numeric(6,2),
  unique (assignment_id, student_id)
);
create table if not exists public.study_materials (
  id           uuid primary key default gen_random_uuid(),
  college_id   uuid not null references public.colleges on delete cascade,
  subject_id   uuid not null references public.subjects on delete cascade,
  title        text not null,
  kind         text check (kind in ('pdf','ppt','doc','video','link')),
  path_or_url  text not null,
  uploaded_by  uuid references public.teachers on delete set null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Leave, fees, notifications, events
-- ---------------------------------------------------------------
create table if not exists public.leave_applications (
  id            uuid primary key default gen_random_uuid(),
  college_id    uuid not null references public.colleges on delete cascade,
  student_id    uuid not null references public.students on delete cascade,
  subject       text not null,
  reason        text not null,
  leave_type    text not null default 'Casual',
  from_date     date not null,
  to_date       date not null,
  attachment    text,
  status        text not null default 'pending' check (status in ('pending','teacher_approved','approved','rejected')),
  teacher_note  text,
  chairman_note text,
  approved_at   timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists public.fee_receipts (
  id          uuid primary key default gen_random_uuid(),
  college_id  uuid not null references public.colleges on delete cascade,
  student_id  uuid not null references public.students on delete cascade,
  amount      numeric(10,2) not null,
  paid_on     date not null,
  file_path   text,
  status      text not null default 'pending' check (status in ('pending','verified','rejected')),
  verified_by uuid references auth.users on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  college_id uuid references public.colleges on delete cascade,
  user_id    uuid references auth.users on delete cascade,
  role_scope public.user_role,
  title      text not null,
  body       text,
  category   text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  college_id  uuid not null references public.colleges on delete cascade,
  title       text not null,
  description text,
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  poster_path text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------
create table if not exists public.activity_logs (
  id         uuid primary key default gen_random_uuid(),
  college_id uuid references public.colleges on delete cascade,
  user_id    uuid references auth.users on delete set null,
  action     text not null,
  meta       jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Helper functions & triggers
-- ---------------------------------------------------------------

-- Auto-set updated_at
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_students_touch on public.students;
create trigger trg_students_touch before update on public.students
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Create a `profiles` row automatically for every new auth user
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'student'),
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Return the caller's role (SECURITY DEFINER because it reads profiles).
create or replace function public.current_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'student'::public.user_role
  );
$$;

-- Return the caller's college_id (used by every RLS policy).
create or replace function public.current_college() returns uuid
language sql stable security definer set search_path = public as $$
  select college_id from public.profiles where id = auth.uid();
$$;
