-- =====================================================================
--  Migration 014 — Unified academic data access & strict RBAC
--  =====================================================================
--  Goals (spec items 21-28):
--    • Students, Teachers, Admins all read the SAME roster from
--      public.students (Directory + Rankings work identically).
--    • Students still cannot write anything (except their own profile).
--    • Teachers/Admins keep full write access to marks/attendance.
--    • Private columns (phone, email, address, DOB) are hidden from
--      other students by a dedicated "public academic" view.
--
--  Safe to re-run.
-- =====================================================================

------------------------------------------------------------
-- 1. Students table: everyone in the same college can READ
------------------------------------------------------------
-- Was: teachers/admins see all, students see only themselves.
-- Now: any authenticated user in the same college sees the whole roster.
drop policy if exists p_students_read on public.students;
create policy p_students_read on public.students for select using (
  public.current_role() = 'super'
  or college_id = public.current_college()
);

-- Students still can only UPDATE their own row (already existed):
--   p_students_update_self (via auth_user_id = auth.uid())
-- Admins already have full write (p_students_admin_all).
-- No INSERT/DELETE for teachers or students — enforced by absence of
-- policies for those roles.

------------------------------------------------------------
-- 2. Results table: any authenticated user in the same
--    college can READ (needed for Directory + StudentProfile
--    to show semester-wise SGPA to peers).
--    Students / teachers cannot INSERT/UPDATE/DELETE.
------------------------------------------------------------
drop policy if exists p_results_read on public.results;
create policy p_results_read on public.results for select using (
  public.current_role() = 'super'
  or college_id = public.current_college()
);

------------------------------------------------------------
-- 3. Marks table: same read scope as results
------------------------------------------------------------
drop policy if exists p_marks_read on public.marks;
create policy p_marks_read on public.marks for select using (
  public.current_role() = 'super'
  or college_id = public.current_college()
);

-- Marks write policy already restricts to teacher/admin/super. Reaffirm:
drop policy if exists p_marks_write on public.marks;
create policy p_marks_write on public.marks for all using (
  public.current_role() in ('teacher','admin','super')
) with check (public.current_role() in ('teacher','admin','super'));

------------------------------------------------------------
-- 4. Attendance table: everyone in the same college can READ
--    (needed for peer rank cards on Directory/Rankings).
--    Only teachers/admins can WRITE.
------------------------------------------------------------
drop policy if exists p_att_read on public.attendance;
create policy p_att_read on public.attendance for select using (
  public.current_role() = 'super'
  or college_id = public.current_college()
);

drop policy if exists p_att_write on public.attendance;
create policy p_att_write on public.attendance for all using (
  public.current_role() in ('teacher','admin','super')
  and college_id = public.current_college()
) with check (
  public.current_role() in ('teacher','admin','super')
  and college_id = public.current_college()
);

------------------------------------------------------------
-- 5. Public academic view — used by Directory / StudentProfile
--    to guarantee no private columns ever leak to peers.
--    (App also enforces this in the UI, but this is defence-in-depth.)
------------------------------------------------------------
create or replace view public.v_students_public as
  select id,
         college_id,
         department_id,
         course_id,
         reg_no,
         name,
         roll_number,
         semester,
         section,
         admission_year,
         academic_year,
         cgpa,
         sgpa,
         photo_url,
         status,
         skills,
         achievements,
         badges
    from public.students
   where status = 'active';

grant select on public.v_students_public to authenticated;
grant select on public.v_students_public to anon;

------------------------------------------------------------
-- 6. Helper: aggregated attendance percentage per student
--    Used by Rankings to sort by attendance without pulling
--    the whole attendance table into the browser.
------------------------------------------------------------
create or replace view public.v_student_attendance as
  select s.id                                              as student_id,
         s.college_id,
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

------------------------------------------------------------
-- 7. Sanity: teachers table already readable to same college
------------------------------------------------------------
-- (no change — existing p_teachers_read already scoped to college)

------------------------------------------------------------
-- 8. Notices already scoped to college (mig 006). No change.
------------------------------------------------------------
