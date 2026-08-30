-- =====================================================================
--  021_merge_subject_duplicates.sql
--  ---------------------------------------------------------------------
--  DIAGNOSIS:
--    Semester 5 has TWO sets of subject rows:
--      • legacy rows with code  SE / DA / MAD / IT  (from migration 012)
--      • newer  rows with code  BVVS-SE / BVVS-DA / BVVS-MAD / BVVS-IT
--        (added when a previous fix re-inserted subjects with prefix)
--    Both sets describe the SAME four academic subjects. The timetable,
--    attendance and other FK tables point at a mix of the two sets, which
--    is why teachers saw each subject twice in dropdowns.
--
--  FIX (data-safe):
--    1) For each legacy↔new pair, repoint every FK (attendance, marks,
--       assignments, study_materials, timetable, teacher_assignments)
--       from the legacy id to the BVVS-* id, deduplicating where UNIQUE
--       constraints would collide (keep the BVVS-* row).
--    2) Delete the legacy SE/DA/MAD/IT subject rows now that nothing
--       references them.
--
--  This is idempotent — safe to run repeatedly.
-- =====================================================================

do $$
declare
  v_college uuid := '11111111-1111-1111-1111-111111111111';
  r record;
  v_old uuid; v_new uuid;
begin
  for r in
    select unnest(array['DA','IT','MAD','SE'])             as old_code,
           unnest(array['BVVS-DA','BVVS-IT','BVVS-MAD','BVVS-SE']) as new_code
  loop
    select id into v_new
      from public.subjects
     where college_id = v_college and code = r.new_code and semester = 5
     limit 1;
    if v_new is null then continue; end if;

    for v_old in
      select id from public.subjects
       where college_id = v_college and code = r.old_code and semester = 5
    loop
      -- attendance (unique: student_id, subject_id, taken_on)
      delete from public.attendance a
       where a.college_id = v_college and a.subject_id = v_old
         and exists (select 1 from public.attendance b
                      where b.student_id=a.student_id and b.taken_on=a.taken_on
                        and b.subject_id=v_new);
      update public.attendance set subject_id = v_new
       where college_id = v_college and subject_id = v_old;

      -- marks
      delete from public.marks a
       where a.college_id = v_college and a.subject_id = v_old
         and exists (select 1 from public.marks b
                      where b.student_id=a.student_id and b.kind=a.kind
                        and b.subject_id=v_new);
      update public.marks set subject_id = v_new
       where college_id = v_college and subject_id = v_old;

      -- assignments
      delete from public.assignments a
       where a.college_id = v_college and a.subject_id = v_old
         and exists (select 1 from public.assignments b
                      where b.college_id=a.college_id
                        and b.section_id is not distinct from a.section_id
                        and b.title=a.title and b.subject_id=v_new);
      update public.assignments set subject_id = v_new
       where college_id = v_college and subject_id = v_old;

      -- timetable
      delete from public.timetable a
       where a.college_id = v_college and a.subject_id = v_old
         and exists (select 1 from public.timetable b
                      where b.college_id=a.college_id and b.section_id=a.section_id
                        and b.day_of_week=a.day_of_week and b.start_time=a.start_time
                        and b.subject_id=v_new);
      update public.timetable set subject_id = v_new
       where college_id = v_college and subject_id = v_old;

      -- teacher_assignments
      delete from public.teacher_assignments a
       where a.subject_id = v_old
         and exists (select 1 from public.teacher_assignments b
                      where b.teacher_id=a.teacher_id
                        and b.section_id is not distinct from a.section_id
                        and b.subject_id=v_new);
      update public.teacher_assignments set subject_id = v_new
       where subject_id = v_old;

      -- study_materials (notes) — table was added in migration 018
      begin
        execute format(
          'delete from public.study_materials a
            where a.college_id=$1 and a.subject_id=$2
              and exists (select 1 from public.study_materials b
                           where b.college_id=a.college_id and b.title=a.title
                             and b.subject_id=$3)')
          using v_college, v_old, v_new;
        execute 'update public.study_materials set subject_id=$1 where college_id=$2 and subject_id=$3'
          using v_new, v_college, v_old;
      exception when undefined_table then null; end;

      -- teachers.assigned_subjects — replace 'SE'/'DA' etc with BVVS-* in text[]
      update public.teachers
         set assigned_subjects = array_replace(assigned_subjects, r.old_code, r.new_code)
       where college_id = v_college
         and assigned_subjects @> array[r.old_code];

      delete from public.subjects where id = v_old;
    end loop;
  end loop;
end $$;

-- Verify: Sem 5 subjects must now be exactly the four BVVS-* rows.
select code, name, semester from public.subjects
 where college_id='11111111-1111-1111-1111-111111111111' and semester=5
 order by code;
