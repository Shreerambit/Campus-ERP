-- =====================================================================
--  023_shreeram_sem4_marks.sql
--  Adds Sem 4 marks for Shreeram Krishnappa (U26ZW24S0230)
--  including Web Technology 92/100 (Internal 19/20 + External 73/80).
--  Also adds Sem 5 subject rows (BVVS-* codes) if they don't exist.
-- =====================================================================

-- Ensure Sem 5 subjects exist with BVVS- prefix (canonical codes from migration 021)
insert into public.subjects (college_id, department_id, code, name, semester, credits) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0001-0000-0000-000000000001','BVVS-SE',  'Software Engineering',           5, 4),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0001-0000-0000-000000000001','BVVS-DA',  'Data Analytics',                 5, 4),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0001-0000-0000-000000000001','BVVS-MAD', 'Mobile Application Development', 5, 4),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0001-0000-0000-000000000001','BVVS-IT',  'Internet Technology',            5, 4)
on conflict (college_id, code) do update set name = excluded.name, semester = excluded.semester;

-- =====================================================================
-- Add Sem 4 marks for Shreeram (Web Technology = 92/100 strong subject)
-- Web Technology: Internal 19/20 + External 73/80 = 92/100
-- =====================================================================
with src(reg_no, code, kind, score, max_score) as (values
  -- Web Technology (Sem 4) — 92/100 strong subject
  ('U26ZW24S0230'::text, '2E4XXXM11T'::text, 'internal'::text, 19::numeric, 20::numeric),
  ('U26ZW24S0230'::text, '2E4XXXM11T'::text, 'external'::text, 73::numeric, 80::numeric),
  -- Web Technology Lab (Sem 4) — strong in labs too
  ('U26ZW24S0230'::text, '2E4XXXM11L'::text, 'internal'::text, 9::numeric, 10::numeric),
  ('U26ZW24S0230'::text, '2E4XXXM11L'::text, 'external'::text, 37::numeric, 40::numeric),
  -- Python Programming (Sem 4)
  ('U26ZW24S0230'::text, '2E4XXXM10T'::text, 'internal'::text, 17::numeric, 20::numeric),
  ('U26ZW24S0230'::text, '2E4XXXM10T'::text, 'external'::text, 58::numeric, 80::numeric),
  -- Python Lab
  ('U26ZW24S0230'::text, '2E4XXXM10L'::text, 'internal'::text, 8::numeric, 10::numeric),
  ('U26ZW24S0230'::text, '2E4XXXM10L'::text, 'external'::text, 33::numeric, 40::numeric),
  -- Operating System Concepts (Sem 4)
  ('U26ZW24S0230'::text, '2E4XXXM12T'::text, 'internal'::text, 15::numeric, 20::numeric),
  ('U26ZW24S0230'::text, '2E4XXXM12T'::text, 'external'::text, 52::numeric, 80::numeric)
)
insert into public.marks (college_id, student_id, subject_id, kind, score, max_score)
select
  '11111111-1111-1111-1111-111111111111',
  st.id,
  sub.id,
  src.kind,
  src.score,
  src.max_score
from src
join public.students st on st.reg_no = src.reg_no
  and st.college_id = '11111111-1111-1111-1111-111111111111'
join public.subjects sub on sub.code = src.code
  and sub.college_id = '11111111-1111-1111-1111-111111111111'
on conflict (student_id, subject_id, kind) do update
  set score = excluded.score, max_score = excluded.max_score;

-- Verify: show Shreeram's marks for Web Technology
select sub.code, sub.name, sub.semester, m.kind, m.score, m.max_score
from public.marks m
join public.students st on st.id = m.student_id
join public.subjects sub on sub.id = m.subject_id
where st.reg_no = 'U26ZW24S0230'
  and sub.code in ('2E4XXXM11T','2E4XXXM11L','2E4XXXM10T','2E4XXXM10L','2E4XXXM12T')
order by sub.semester, sub.code, m.kind;
