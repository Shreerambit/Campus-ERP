-- =====================================================================
--  Migration 017 — Subject-scoped attendance ownership
--  =====================================================================
--
--  Goals (spec §1-§9):
--    • Each attendance row already carries subject_id + taken_by.
--    • Enforce that a TEACHER can only INSERT/UPDATE/DELETE rows for a
--      subject listed in their public.teachers.assigned_subjects array.
--    • Auto-stamp taken_by with the teacher.id on insert so we always
--      know which teacher owns the record.
--    • Admin/super retain full control.
--    • READ scope is unchanged (any authenticated user in the same
--      college can read — needed for students & directory).
--
--  Safe to re-run.
-- =====================================================================

------------------------------------------------------------
-- 1. Helper: is the current auth.uid() a teacher who owns
--    the given subject in the given college?
------------------------------------------------------------
create or replace function public.teacher_owns_subject(p_college uuid, p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.teachers t
      join public.subjects s
        on s.id = p_subject
       and s.college_id = t.college_id
       and s.code = any (t.assigned_subjects)
     where t.auth_user_id = auth.uid()
       and t.college_id = p_college
       and t.status = 'active'
  );
$$;

grant execute on function public.teacher_owns_subject(uuid, uuid) to authenticated;

------------------------------------------------------------
-- 2. Trigger: auto-stamp taken_by with the calling teacher
------------------------------------------------------------
create or replace function public.trg_attendance_stamp_teacher()
returns trigger
language plpgsql
security definer
as $$
declare v_teacher uuid;
begin
  if new.taken_by is null then
    select t.id into v_teacher
      from public.teachers t
     where t.auth_user_id = auth.uid()
       and t.college_id  = new.college_id
     limit 1;
    if v_teacher is not null then
      new.taken_by := v_teacher;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_attendance_stamp_teacher on public.attendance;
create trigger on_attendance_stamp_teacher
  before insert on public.attendance
  for each row execute function public.trg_attendance_stamp_teacher();

------------------------------------------------------------
-- 3. Replace attendance write policies with subject-scoped ones
------------------------------------------------------------
drop policy if exists p_att_write   on public.attendance;
drop policy if exists p_att_insert  on public.attendance;
drop policy if exists p_att_update  on public.attendance;
drop policy if exists p_att_delete  on public.attendance;

-- INSERT: admin/super in college, OR teacher who owns this subject
create policy p_att_insert on public.attendance
  for insert to authenticated
  with check (
    public.current_role() = 'super'
    or (public.current_role() = 'admin' and college_id = public.current_college())
    or (public.current_role() = 'teacher'
        and college_id = public.current_college()
        and public.teacher_owns_subject(college_id, subject_id))
  );

-- UPDATE: same rules; a teacher can only edit rows for subjects they own
create policy p_att_update on public.attendance
  for update to authenticated
  using (
    public.current_role() = 'super'
    or (public.current_role() = 'admin' and college_id = public.current_college())
    or (public.current_role() = 'teacher'
        and college_id = public.current_college()
        and public.teacher_owns_subject(college_id, subject_id))
  )
  with check (
    public.current_role() = 'super'
    or (public.current_role() = 'admin' and college_id = public.current_college())
    or (public.current_role() = 'teacher'
        and college_id = public.current_college()
        and public.teacher_owns_subject(college_id, subject_id))
  );

-- DELETE: admin/super, or teacher who owns the subject
create policy p_att_delete on public.attendance
  for delete to authenticated
  using (
    public.current_role() = 'super'
    or (public.current_role() = 'admin' and college_id = public.current_college())
    or (public.current_role() = 'teacher'
        and college_id = public.current_college()
        and public.teacher_owns_subject(college_id, subject_id))
  );

-- Read policy p_att_read from mig 014 is unchanged.
