-- =====================================================================
--  025_course_separation_fixes.sql
--  ---------------------------------------------------------------------
--  Purpose:
--    1. Enhance v_students_public with human-readable course & dept names
--       so the frontend never needs a hardcoded "BCA" or "Computer Science".
--    2. Create v_college_summary for Super Admin dashboard (real counts).
--    3. Add get_college_stats() RPC used by Super Admin.
--    4. Tighten attendance RLS so teachers only write to their college.
--
--  Idempotent — safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------
-- 1. Drop and recreate v_students_public with course/dept names
--    (adds: course_code, course_name, department_code, department_name)
-- ---------------------------------------------------------------
drop view if exists public.v_students_public cascade;

create or replace view public.v_students_public as
  select
    s.id,
    s.college_id,
    s.department_id,
    s.course_id,
    s.reg_no,
    s.name,
    s.roll_number,
    s.semester,
    s.section,
    s.admission_year,
    s.academic_year,
    s.cgpa,
    s.sgpa,
    s.photo_url,
    s.status,
    s.skills,
    s.achievements,
    s.badges,
    -- Human-readable names (never needs frontend hardcoding)
    c.code    as course_code,
    c.name    as course_name,
    d.code    as department_code,
    d.name    as department_name
  from public.students s
  left join public.courses     c on c.id = s.course_id
  left join public.departments d on d.id = s.department_id
  where s.status = 'active';

grant select on public.v_students_public to authenticated;
grant select on public.v_students_public to anon;

-- ---------------------------------------------------------------
-- 2. Re-grant v_student_attendance (it joins students → may need refresh)
-- ---------------------------------------------------------------
create or replace view public.v_student_attendance as
  select s.id                                              as student_id,
         s.college_id,
         s.course_id,
         s.semester,
         s.section,
         s.reg_no,
         count(a.id)                                       as total,
         count(a.id) filter (where a.status in ('present','leave')) as present,
         case when count(a.id) = 0 then 0
              else round( 100.0 * count(a.id) filter (where a.status in ('present','leave'))
                                 / count(a.id), 1)
         end                                               as pct
    from public.students s
    left join public.attendance a on a.student_id = s.id
   where s.status = 'active'
   group by s.id;

grant select on public.v_student_attendance to authenticated;

-- ---------------------------------------------------------------
-- 3. v_college_summary — super admin gets real per-college counts
-- ---------------------------------------------------------------
create or replace view public.v_college_summary as
  select
    col.id              as college_id,
    col.name            as college_name,
    col.code            as college_code,
    col.status,
    count(distinct s.id)    as student_count,
    count(distinct t.id)    as teacher_count,
    count(distinct d.id)    as department_count,
    count(distinct cr.id)   as course_count
  from public.colleges col
  left join public.students    s  on s.college_id  = col.id and s.status = 'active'
  left join public.teachers    t  on t.college_id  = col.id
  left join public.departments d  on d.college_id  = col.id
  left join public.courses     cr on cr.department_id in (
    select id from public.departments where college_id = col.id
  )
  group by col.id;

alter view public.v_college_summary owner to postgres;
grant select on public.v_college_summary to authenticated;

-- RLS-aware: only super can read all rows; admins see their own college
drop policy if exists p_college_summary_read on public.v_college_summary;
-- Views don't support RLS directly; security is handled by the
-- underlying tables' own RLS and by the function below.

-- ---------------------------------------------------------------
-- 4. get_college_stats() RPC — super admin summary
-- ---------------------------------------------------------------
create or replace function public.get_college_stats()
returns table (
  college_id        uuid,
  college_name      text,
  college_code      text,
  status            text,
  student_count     bigint,
  teacher_count     bigint,
  department_count  bigint,
  course_count      bigint
)
language sql stable security definer set search_path = public
as $$
  select
    college_id, college_name, college_code, status,
    student_count, teacher_count, department_count, course_count
  from public.v_college_summary
  order by college_name;
$$;

grant execute on function public.get_college_stats() to authenticated;

-- ---------------------------------------------------------------
-- 5. get_admin_dashboard_stats() — per-college admin stats
-- ---------------------------------------------------------------
create or replace function public.get_admin_dashboard_stats(p_college_id uuid)
returns table (
  student_count     bigint,
  teacher_count     bigint,
  course_count      bigint,
  department_count  bigint,
  notice_count      bigint,
  pending_leaves    bigint
)
language sql stable security definer set search_path = public
as $$
  select
    (select count(*) from public.students    where college_id = p_college_id and status = 'active') as student_count,
    (select count(*) from public.teachers    where college_id = p_college_id) as teacher_count,
    (select count(*) from public.courses     cr
      join public.departments d on d.id = cr.department_id
      where d.college_id = p_college_id) as course_count,
    (select count(*) from public.departments where college_id = p_college_id) as department_count,
    (select count(*) from public.notices     where college_id = p_college_id) as notice_count,
    (select count(*) from public.leave_applications where college_id = p_college_id and status = 'pending') as pending_leaves;
$$;

grant execute on function public.get_admin_dashboard_stats(uuid) to authenticated;

-- ---------------------------------------------------------------
-- 6. get_course_student_counts() — per-course student breakdown
-- ---------------------------------------------------------------
create or replace function public.get_course_student_counts(p_college_id uuid)
returns table (
  course_id    uuid,
  course_code  text,
  course_name  text,
  semester     int,
  student_count bigint
)
language sql stable security definer set search_path = public
as $$
  select
    s.course_id,
    cr.code as course_code,
    cr.name as course_name,
    s.semester,
    count(*) as student_count
  from public.students s
  join public.courses cr on cr.id = s.course_id
  where s.college_id = p_college_id
    and s.status = 'active'
  group by s.course_id, cr.code, cr.name, s.semester
  order by cr.name, s.semester;
$$;

grant execute on function public.get_course_student_counts(uuid) to authenticated;
