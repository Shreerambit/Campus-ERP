-- =====================================================================
--  Migration 013 — Section normalization + CGPA auto-compute
--  =====================================================================
--
--  Fixes:
--    1. Students imported from UUCMS have batch codes A..L in `section`,
--       but the college only has 2 real sections A & B. Force pickers by
--       nulling any section not in {A,B} and adding `section_confirmed`.
--    2. CGPA must equal AVG(SGPA) across completed semesters — add a
--       trigger on public.results so it stays correct forever.
--    3. Latest SGPA must equal the highest-semester SGPA — same trigger.
--    4. Backfill existing rows so everything is correct today.
--
--  Safe to re-run.
-- =====================================================================

------------------------------------------------------------
-- 1. Section normalization
------------------------------------------------------------
alter table public.students
  add column if not exists section_confirmed boolean not null default false;

-- IMPORTANT: drop NOT NULL FIRST so the UPDATE below is allowed.
alter table public.students alter column section drop not null;

-- Any student whose section is not A or B → NULL, must re-pick
update public.students
   set section = null,
       section_confirmed = false
 where section is not null
   and section not in ('A','B');

-- Students already in A or B are considered confirmed (no re-pick).
update public.students
   set section_confirmed = true
 where section in ('A','B');

-- Allow the student to update their own section during first login.
-- (Extra safety – already covered by the profile-owner update policy.)
drop policy if exists p_students_update_own_section on public.students;
create policy p_students_update_own_section on public.students
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

------------------------------------------------------------
-- 2. CGPA / latest-SGPA auto-recompute trigger
------------------------------------------------------------
create or replace function public.recompute_student_gpa(p_student uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.students s
     set cgpa = coalesce(
                  (select round(avg(sgpa)::numeric, 2)
                     from public.results
                    where student_id = s.id and sgpa is not null),
                  0
                ),
         sgpa = coalesce(
                  (select sgpa
                     from public.results
                    where student_id = s.id and sgpa is not null
                    order by semester desc
                    limit 1),
                  0
                )
   where s.id = p_student;
end;
$$;

create or replace function public.trg_results_gpa()
returns trigger
language plpgsql
security definer
as $$
begin
  perform public.recompute_student_gpa(coalesce(new.student_id, old.student_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists on_results_change_gpa on public.results;
create trigger on_results_change_gpa
  after insert or update or delete on public.results
  for each row execute function public.trg_results_gpa();

------------------------------------------------------------
-- 3. Backfill current CGPA/SGPA for every student
------------------------------------------------------------
do $$
declare r record;
begin
  for r in select id from public.students loop
    perform public.recompute_student_gpa(r.id);
  end loop;
end $$;

------------------------------------------------------------
-- 4. Sanity view — quick verification (optional)
------------------------------------------------------------
create or replace view public.v_student_gpa_check as
  select s.reg_no,
         s.name,
         s.section,
         s.sgpa                            as stored_sgpa,
         s.cgpa                            as stored_cgpa,
         (select count(*) from public.results r where r.student_id = s.id) as sem_results
    from public.students s
   order by s.reg_no;

-- Grant read for anon so login pickers can query if ever needed
grant select on public.v_student_gpa_check to anon, authenticated;
