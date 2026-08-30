-- =====================================================================
--  012 — Seed BVVS BCA V Sem timetable (both A & B divisions)
--       Source: Tentative Theory Time Table 2026-27 (Basaveshwar Science
--       College, Bagalkote — Dept. of Computer Science)
--
--  Subject codes:  SE, DA, MAD, IT
--  Time slots:     09:00-10:00 · 10:15-11:15 · 11:15-12:15  (Mon-Sat)
--  Sections:       A & B
--
--  This migration:
--   1) Ensures the 4 subjects exist (SE/DA/MAD/IT) for BVVS BCA Sem 5.
--   2) Deletes any existing timetable rows for BCA Sem 5 (idempotent).
--   3) Inserts the full week × section × time-slot grid.
--   4) Links each slot to the correct teacher by username.
-- =====================================================================

-- --- 1) Ensure subjects exist ---
insert into public.subjects (college_id, department_id, code, name, semester, credits) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0001-0000-0000-000000000001', 'SE',  'Software Engineering',           5, 4),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0001-0000-0000-000000000001', 'DA',  'Data Analytics',                 5, 4),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0001-0000-0000-000000000001', 'MAD', 'Mobile Application Development', 5, 4),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0001-0000-0000-000000000001', 'IT',  'Internet Technology',            5, 4)
on conflict (college_id, code) do update set
  name = excluded.name, semester = excluded.semester;

-- --- 2) Delete any existing Sem 5 slots for a clean replace ---
delete from public.timetable
 where college_id = '11111111-1111-1111-1111-111111111111'
   and section_id in (
     select id from public.sections
     where course_id = 'bbbbbbbb-0001-0000-0000-000000000001'
       and semester = 5
   );

-- --- 3) Insert timetable rows ---
with grid(section, dow, start_time, end_time, subject_code) as (values
  -- =============== SECTION A ===============
  -- Monday
  ('A', 1, '09:00'::time, '10:00'::time, 'IT'),
  ('A', 1, '10:15'::time, '11:15'::time, 'DA'),
  ('A', 1, '11:15'::time, '12:15'::time, 'MAD'),
  -- Tuesday
  ('A', 2, '09:00'::time, '10:00'::time, 'SE'),
  ('A', 2, '10:15'::time, '11:15'::time, 'IT'),
  ('A', 2, '11:15'::time, '12:15'::time, 'MAD'),
  -- Wednesday
  ('A', 3, '09:00'::time, '10:00'::time, 'MAD'),
  ('A', 3, '10:15'::time, '11:15'::time, 'DA'),
  ('A', 3, '11:15'::time, '12:15'::time, 'IT'),
  -- Thursday
  ('A', 4, '09:00'::time, '10:00'::time, 'DA'),
  ('A', 4, '10:15'::time, '11:15'::time, 'MAD'),
  ('A', 4, '11:15'::time, '12:15'::time, 'SE'),
  -- Friday
  ('A', 5, '10:15'::time, '11:15'::time, 'SE'),
  ('A', 5, '11:15'::time, '12:15'::time, 'IT'),
  -- Saturday
  ('A', 6, '09:00'::time, '10:00'::time, 'SE'),
  ('A', 6, '10:15'::time, '11:15'::time, 'DA'),

  -- =============== SECTION B ===============
  -- Monday
  ('B', 1, '09:00'::time, '10:00'::time, 'DA'),
  ('B', 1, '10:15'::time, '11:15'::time, 'IT'),
  ('B', 1, '11:15'::time, '12:15'::time, 'SE'),
  -- Tuesday
  ('B', 2, '09:00'::time, '10:00'::time, 'MAD'),
  ('B', 2, '10:15'::time, '11:15'::time, 'DA'),
  ('B', 2, '11:15'::time, '12:15'::time, 'SE'),
  -- Wednesday
  ('B', 3, '09:00'::time, '10:00'::time, 'SE'),
  ('B', 3, '10:15'::time, '11:15'::time, 'IT'),
  ('B', 3, '11:15'::time, '12:15'::time, 'DA'),
  -- Thursday
  ('B', 4, '09:00'::time, '10:00'::time, 'IT'),
  ('B', 4, '10:15'::time, '11:15'::time, 'SE'),
  ('B', 4, '11:15'::time, '12:15'::time, 'MAD'),
  -- Friday
  ('B', 5, '10:15'::time, '11:15'::time, 'MAD'),
  ('B', 5, '11:15'::time, '12:15'::time, 'DA'),
  -- Saturday
  ('B', 6, '09:00'::time, '10:00'::time, 'MAD'),
  ('B', 6, '10:15'::time, '11:15'::time, 'IT')
)
insert into public.timetable
  (college_id, section_id, day_of_week, start_time, end_time, subject_id, teacher_id, room, slot_type)
select
  '11111111-1111-1111-1111-111111111111'::uuid,
  sec.id,
  g.dow,
  g.start_time,
  g.end_time,
  sub.id,
  tch.id,
  case sec.section when 'A' then 'Room 204' when 'B' then 'Room 205' end,
  'Lecture'
from grid g
  join public.sections sec
    on sec.course_id = 'bbbbbbbb-0001-0000-0000-000000000001'
   and sec.semester  = 5
   and sec.section   = g.section
  join public.subjects sub
    on sub.college_id = '11111111-1111-1111-1111-111111111111'
   and sub.code       = g.subject_code
  -- Map subject → teacher (fall back to NULL if teacher not created yet)
  left join public.teachers tch
    on tch.college_id = '11111111-1111-1111-1111-111111111111'
   and lower(tch.username) = case g.subject_code
     when 'SE'  then 'praveen'
     when 'DA'  then 'naina'
     when 'MAD' then 'neelkanth'
     when 'IT'  then 'akshat'
   end;

-- --- 4) Verify ---
select
  sec.section,
  case t.day_of_week
    when 0 then 'Sun' when 1 then 'Mon' when 2 then 'Tue' when 3 then 'Wed'
    when 4 then 'Thu' when 5 then 'Fri' when 6 then 'Sat'
  end as day,
  to_char(t.start_time, 'HH24:MI') || '-' || to_char(t.end_time, 'HH24:MI') as slot,
  sub.code as subject,
  coalesce(tch.name, '(no teacher)') as teacher,
  t.room
from public.timetable t
  join public.sections sec on sec.id = t.section_id
  left join public.subjects sub on sub.id = t.subject_id
  left join public.teachers tch on tch.id = t.teacher_id
where t.college_id = '11111111-1111-1111-1111-111111111111'
  and sec.course_id = 'bbbbbbbb-0001-0000-0000-000000000001'
  and sec.semester = 5
order by sec.section, t.day_of_week, t.start_time;
