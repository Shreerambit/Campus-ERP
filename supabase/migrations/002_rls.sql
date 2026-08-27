-- =====================================================================
--  Row-Level Security
--  ---------------------------------------------------------------------
--  Rules:
--   • Super admin      → sees & writes everything.
--   • College admin    → only their college.
--   • Teacher          → only their college; can write attendance/marks.
--   • Student          → only their own row / own metrics.
--   • Parent (future)  → only linked student.
--  Run after 001_schema.sql.
-- =====================================================================

alter table public.profiles              enable row level security;
alter table public.colleges              enable row level security;
alter table public.departments           enable row level security;
alter table public.courses               enable row level security;
alter table public.sections              enable row level security;
alter table public.subjects              enable row level security;
alter table public.students              enable row level security;
alter table public.teachers              enable row level security;
alter table public.teacher_assignments   enable row level security;
alter table public.timetable             enable row level security;
alter table public.attendance            enable row level security;
alter table public.marks                 enable row level security;
alter table public.results               enable row level security;
alter table public.assignments           enable row level security;
alter table public.assignment_submissions enable row level security;
alter table public.study_materials       enable row level security;
alter table public.leave_applications    enable row level security;
alter table public.fee_receipts          enable row level security;
alter table public.notifications         enable row level security;
alter table public.events                enable row level security;
alter table public.activity_logs         enable row level security;

/* ============================================================
   Predicates we inline into each policy for speed:
     public.current_role()    → user's role from profiles
     public.current_college() → user's college_id from profiles
   ============================================================ */

/* ---------- profiles ---------- */
drop policy if exists p_profiles_self on public.profiles;
create policy p_profiles_self on public.profiles
  for select using (id = auth.uid() or public.current_role() in ('admin','super'));

drop policy if exists p_profiles_update_self on public.profiles;
create policy p_profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

/* ---------- colleges ---------- */
drop policy if exists p_colleges_read on public.colleges;
create policy p_colleges_read on public.colleges
  for select using (
    public.current_role() = 'super'
    or id = public.current_college()
    or auth.uid() is null                       -- allow login screens to list colleges
  );

drop policy if exists p_colleges_super_all on public.colleges;
create policy p_colleges_super_all on public.colleges
  for all using (public.current_role() = 'super') with check (public.current_role() = 'super');

/* ---------- departments (has direct college_id) ---------- */
drop policy if exists p_departments_read on public.departments;
create policy p_departments_read on public.departments for select using (
  public.current_role() = 'super'
  or college_id = public.current_college()
  or auth.uid() is null
);
drop policy if exists p_departments_admin on public.departments;
create policy p_departments_admin on public.departments for all using (
  public.current_role() = 'super'
  or (public.current_role() = 'admin' and college_id = public.current_college())
) with check (
  public.current_role() = 'super'
  or (public.current_role() = 'admin' and college_id = public.current_college())
);

/* ---------- courses (indirect: courses.department_id → departments.college_id) ---------- */
drop policy if exists p_courses_read on public.courses;
create policy p_courses_read on public.courses for select using (
  public.current_role() = 'super'
  or exists (
    select 1 from public.departments d
    where d.id = courses.department_id
      and d.college_id = public.current_college()
  )
  or auth.uid() is null
);
drop policy if exists p_courses_admin on public.courses;
create policy p_courses_admin on public.courses for all using (
  public.current_role() = 'super'
  or (
    public.current_role() = 'admin'
    and exists (
      select 1 from public.departments d
      where d.id = courses.department_id
        and d.college_id = public.current_college()
    )
  )
) with check (
  public.current_role() = 'super'
  or (
    public.current_role() = 'admin'
    and exists (
      select 1 from public.departments d
      where d.id = courses.department_id
        and d.college_id = public.current_college()
    )
  )
);

/* ---------- sections (indirect: sections.course_id → courses → departments.college_id) ---------- */
drop policy if exists p_sections_read on public.sections;
create policy p_sections_read on public.sections for select using (
  public.current_role() = 'super'
  or exists (
    select 1
    from public.courses c
    join public.departments d on d.id = c.department_id
    where c.id = sections.course_id
      and d.college_id = public.current_college()
  )
  or auth.uid() is null
);
drop policy if exists p_sections_admin on public.sections;
create policy p_sections_admin on public.sections for all using (
  public.current_role() = 'super'
  or (
    public.current_role() = 'admin'
    and exists (
      select 1
      from public.courses c
      join public.departments d on d.id = c.department_id
      where c.id = sections.course_id
        and d.college_id = public.current_college()
    )
  )
) with check (
  public.current_role() = 'super'
  or (
    public.current_role() = 'admin'
    and exists (
      select 1
      from public.courses c
      join public.departments d on d.id = c.department_id
      where c.id = sections.course_id
        and d.college_id = public.current_college()
    )
  )
);

/* ---------- subjects (has direct college_id) ---------- */
drop policy if exists p_subjects_read on public.subjects;
create policy p_subjects_read on public.subjects for select using (
  public.current_role() = 'super'
  or college_id = public.current_college()
);
drop policy if exists p_subjects_admin on public.subjects;
create policy p_subjects_admin on public.subjects for all using (
  public.current_role() = 'super'
  or (public.current_role() = 'admin' and college_id = public.current_college())
) with check (
  public.current_role() = 'super'
  or (public.current_role() = 'admin' and college_id = public.current_college())
);

/* ---------- students ---------- */
drop policy if exists p_students_read on public.students;
create policy p_students_read on public.students for select using (
  public.current_role() = 'super'
  or (public.current_role() in ('admin','teacher') and college_id = public.current_college())
  or (auth_user_id = auth.uid())
);
drop policy if exists p_students_update_self on public.students;
create policy p_students_update_self on public.students for update using (
  auth_user_id = auth.uid()
) with check (
  auth_user_id = auth.uid()
);
drop policy if exists p_students_admin_all on public.students;
create policy p_students_admin_all on public.students for all using (
  public.current_role() = 'super'
  or (public.current_role() = 'admin' and college_id = public.current_college())
) with check (
  public.current_role() = 'super'
  or (public.current_role() = 'admin' and college_id = public.current_college())
);

/* ---------- teachers ---------- */
drop policy if exists p_teachers_read on public.teachers;
create policy p_teachers_read on public.teachers for select using (
  public.current_role() = 'super'
  or college_id = public.current_college()
);
drop policy if exists p_teachers_admin on public.teachers;
create policy p_teachers_admin on public.teachers for all using (
  public.current_role() = 'super'
  or (public.current_role() = 'admin' and college_id = public.current_college())
) with check (
  public.current_role() = 'super'
  or (public.current_role() = 'admin' and college_id = public.current_college())
);

/* ---------- teacher_assignments ---------- */
drop policy if exists p_ta_read on public.teacher_assignments;
create policy p_ta_read on public.teacher_assignments for select using (
  public.current_role() in ('admin','super')
  or exists (select 1 from public.teachers t where t.id = teacher_id and t.auth_user_id = auth.uid())
);
drop policy if exists p_ta_admin on public.teacher_assignments;
create policy p_ta_admin on public.teacher_assignments for all using (
  public.current_role() in ('admin','super')
) with check (public.current_role() in ('admin','super'));

/* ---------- timetable ---------- */
drop policy if exists p_tt_read on public.timetable;
create policy p_tt_read on public.timetable for select using (
  public.current_role() = 'super' or college_id = public.current_college()
);
drop policy if exists p_tt_admin on public.timetable;
create policy p_tt_admin on public.timetable for all using (
  public.current_role() = 'super'
  or (public.current_role() = 'admin' and college_id = public.current_college())
) with check (
  public.current_role() = 'super'
  or (public.current_role() = 'admin' and college_id = public.current_college())
);

/* ---------- attendance ---------- */
drop policy if exists p_att_read on public.attendance;
create policy p_att_read on public.attendance for select using (
  public.current_role() = 'super'
  or (public.current_role() in ('admin','teacher') and college_id = public.current_college())
  or exists (select 1 from public.students s where s.id = student_id and s.auth_user_id = auth.uid())
);
drop policy if exists p_att_write on public.attendance;
create policy p_att_write on public.attendance for insert with check (
  public.current_role() in ('teacher','admin','super')
);
drop policy if exists p_att_update on public.attendance;
create policy p_att_update on public.attendance for update using (
  public.current_role() in ('teacher','admin','super')
);

/* ---------- marks / results ---------- */
drop policy if exists p_marks_read on public.marks;
create policy p_marks_read on public.marks for select using (
  public.current_role() = 'super'
  or (public.current_role() in ('admin','teacher') and college_id = public.current_college())
  or exists (select 1 from public.students s where s.id = student_id and s.auth_user_id = auth.uid())
);
drop policy if exists p_marks_write on public.marks;
create policy p_marks_write on public.marks for all using (
  public.current_role() in ('teacher','admin','super')
) with check (public.current_role() in ('teacher','admin','super'));

drop policy if exists p_results_read on public.results;
create policy p_results_read on public.results for select using (
  public.current_role() = 'super'
  or (public.current_role() in ('admin','teacher') and college_id = public.current_college())
  or exists (select 1 from public.students s where s.id = student_id and s.auth_user_id = auth.uid())
);
drop policy if exists p_results_admin on public.results;
create policy p_results_admin on public.results for all using (
  public.current_role() in ('admin','super')
) with check (public.current_role() in ('admin','super'));

/* ---------- assignments / submissions / materials ---------- */
drop policy if exists p_assign_read on public.assignments;
create policy p_assign_read on public.assignments for select using (
  public.current_role() = 'super' or college_id = public.current_college()
);
drop policy if exists p_assign_write on public.assignments;
create policy p_assign_write on public.assignments for all using (
  public.current_role() in ('teacher','admin','super')
) with check (public.current_role() in ('teacher','admin','super'));

drop policy if exists p_sub_read on public.assignment_submissions;
create policy p_sub_read on public.assignment_submissions for select using (
  public.current_role() in ('teacher','admin','super')
  or exists (select 1 from public.students s where s.id = student_id and s.auth_user_id = auth.uid())
);
drop policy if exists p_sub_write on public.assignment_submissions;
create policy p_sub_write on public.assignment_submissions for insert with check (
  exists (select 1 from public.students s where s.id = student_id and s.auth_user_id = auth.uid())
);

drop policy if exists p_material_read on public.study_materials;
create policy p_material_read on public.study_materials for select using (
  public.current_role() = 'super' or college_id = public.current_college()
);
drop policy if exists p_material_write on public.study_materials;
create policy p_material_write on public.study_materials for all using (
  public.current_role() in ('teacher','admin','super')
) with check (public.current_role() in ('teacher','admin','super'));

/* ---------- leave ---------- */
drop policy if exists p_leave_read on public.leave_applications;
create policy p_leave_read on public.leave_applications for select using (
  public.current_role() = 'super'
  or (public.current_role() in ('admin','teacher') and college_id = public.current_college())
  or exists (select 1 from public.students s where s.id = student_id and s.auth_user_id = auth.uid())
);
drop policy if exists p_leave_insert_student on public.leave_applications;
create policy p_leave_insert_student on public.leave_applications for insert with check (
  exists (select 1 from public.students s where s.id = student_id and s.auth_user_id = auth.uid())
);
drop policy if exists p_leave_update_staff on public.leave_applications;
create policy p_leave_update_staff on public.leave_applications for update using (
  public.current_role() in ('teacher','admin','super')
);

/* ---------- fees ---------- */
drop policy if exists p_fees_read on public.fee_receipts;
create policy p_fees_read on public.fee_receipts for select using (
  public.current_role() in ('admin','super')
  or exists (select 1 from public.students s where s.id = student_id and s.auth_user_id = auth.uid())
);
drop policy if exists p_fees_insert_self on public.fee_receipts;
create policy p_fees_insert_self on public.fee_receipts for insert with check (
  exists (select 1 from public.students s where s.id = student_id and s.auth_user_id = auth.uid())
);
drop policy if exists p_fees_verify_admin on public.fee_receipts;
create policy p_fees_verify_admin on public.fee_receipts for update using (
  public.current_role() in ('admin','super')
) with check (public.current_role() in ('admin','super'));

/* ---------- notifications / events / audit ---------- */
drop policy if exists p_notify_read on public.notifications;
create policy p_notify_read on public.notifications for select using (
  public.current_role() = 'super'
  or user_id = auth.uid()
  or (college_id is not null and college_id = public.current_college())
);
drop policy if exists p_notify_write on public.notifications;
create policy p_notify_write on public.notifications for all using (
  public.current_role() in ('teacher','admin','super')
) with check (public.current_role() in ('teacher','admin','super'));

drop policy if exists p_events_read on public.events;
create policy p_events_read on public.events for select using (
  public.current_role() = 'super' or college_id = public.current_college()
);
drop policy if exists p_events_admin on public.events;
create policy p_events_admin on public.events for all using (
  public.current_role() in ('admin','super')
) with check (public.current_role() in ('admin','super'));

drop policy if exists p_audit_read on public.activity_logs;
create policy p_audit_read on public.activity_logs for select using (
  public.current_role() = 'super'
  or (public.current_role() = 'admin' and college_id = public.current_college())
);
drop policy if exists p_audit_write on public.activity_logs;
create policy p_audit_write on public.activity_logs for insert with check (
  auth.uid() is not null
);
