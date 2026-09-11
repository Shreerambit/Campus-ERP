-- =====================================================================
--  010 — Sections seed for BVVS BCA (Sem 1..6, sections A & B)
--        + timetable-friendly indexes
--        + public read policy for sections (needed by login pickers)
-- =====================================================================

-- Ensure sections A & B exist for every BCA semester (1..6)
insert into public.sections (course_id, semester, section)
select 'bbbbbbbb-0001-0000-0000-000000000001'::uuid, s, sec
from generate_series(1, 6) as s
cross join (values ('A'), ('B')) as v(sec)
on conflict (course_id, semester, section) do nothing;

-- Public read access so the login stepper can list sections
drop policy if exists p_sections_public on public.sections;
create policy p_sections_public on public.sections
  for select to anon using (true);

drop policy if exists p_courses_public on public.courses;
create policy p_courses_public on public.courses
  for select to anon using (true);

drop policy if exists p_departments_public on public.departments;
create policy p_departments_public on public.departments
  for select to anon using (true);

-- Indexes for fast timetable + attendance queries
create index if not exists idx_timetable_section_day on public.timetable(section_id, day_of_week);
create index if not exists idx_attendance_college_date on public.attendance(college_id, taken_on desc);
create index if not exists idx_students_section_composite on public.students(college_id, section, semester, status);

-- Add a room+lab flag if missing (idempotent)
alter table public.timetable
  add column if not exists is_lab boolean generated always as (slot_type = 'Lab') stored;

-- =====================================================================
--  Rebalance: every student's section stays as-is (already stored).
--  When a student is missing a section, put them in 'A' as default.
-- =====================================================================
update public.students set section = 'A' where section is null or section = '';

-- =====================================================================
--  RPC: bulk upload timetable from a JSON payload.
--  Admin passes an array of rows; we resolve section_id from
--  (course_id, semester, section) and subject_id from subject_code.
-- =====================================================================
create or replace function public.upload_timetable(
  p_college_id  uuid,
  p_course_id   uuid,
  p_replace     boolean default true,
  p_rows        jsonb   default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_section_id uuid;
  v_subject_id uuid;
  v_teacher_id uuid;
  v_inserted int := 0;
  v_skipped  int := 0;
begin
  -- Check caller is admin/super for this college
  if not (
    coalesce((select role from public.profiles where id = auth.uid()), 'student'::user_role)
      in ('admin','super')
  ) then
    raise exception 'Only admins can upload timetables.';
  end if;

  -- Optionally replace existing rows for this course/section combinations
  if p_replace then
    delete from public.timetable t
    where t.college_id = p_college_id
      and t.section_id in (
        select id from public.sections
        where course_id = p_course_id
      );
  end if;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    -- Resolve section
    select id into v_section_id
      from public.sections
     where course_id = p_course_id
       and semester  = (r->>'semester')::int
       and upper(section) = upper(r->>'section')
     limit 1;

    if v_section_id is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Resolve subject (create-on-the-fly if unknown)
    select id into v_subject_id
      from public.subjects
     where college_id = p_college_id
       and code = r->>'subject_code'
     limit 1;

    if v_subject_id is null and r ? 'subject_code' then
      insert into public.subjects (college_id, code, name, semester, credits)
      values (p_college_id, r->>'subject_code', coalesce(r->>'subject_name', r->>'subject_code'),
              (r->>'semester')::int, 3)
      on conflict (college_id, code) do update set
        name = excluded.name, semester = excluded.semester
      returning id into v_subject_id;
    end if;

    -- Resolve teacher (by username OR emp_id, both fine)
    v_teacher_id := null;
    if r ? 'teacher' and coalesce(r->>'teacher','') <> '' then
      select id into v_teacher_id
        from public.teachers
       where college_id = p_college_id
         and (lower(username) = lower(r->>'teacher') or upper(emp_id) = upper(r->>'teacher'))
       limit 1;
    end if;

    insert into public.timetable
      (college_id, section_id, day_of_week, start_time, end_time,
       subject_id, teacher_id, room, slot_type)
    values
      (p_college_id, v_section_id,
       (r->>'day_of_week')::int,
       (r->>'start_time')::time,
       (r->>'end_time')::time,
       v_subject_id, v_teacher_id,
       nullif(r->>'room',''),
       coalesce(nullif(r->>'slot_type',''), 'Lecture'));

    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
end $$;

grant execute on function public.upload_timetable(uuid, uuid, boolean, jsonb) to authenticated;
