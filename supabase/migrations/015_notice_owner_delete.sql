-- =====================================================================
--  Migration 015 — Notice ownership & delete rules
--  =====================================================================
--
--  Rules enforced at the database (defence-in-depth, not just UI):
--
--    • Any teacher/admin/super in the same college can INSERT a notice,
--      and Postgres auto-stamps `created_by = auth.uid()`.
--    • Any teacher/admin/super can UPDATE their own notice.
--      Admin/super can UPDATE any notice in their college.
--    • Any teacher can DELETE ONLY their own notice.
--      Admin/super can DELETE any notice in their college.
--    • Students never write.
--
--  Safe to re-run.
-- =====================================================================

-- Ensure the column has a proper default so INSERTs don't need to pass it
alter table public.notices
  alter column created_by set default auth.uid();

-- Drop the old blanket write policy that let any teacher delete any notice.
drop policy if exists p_notices_write   on public.notices;
drop policy if exists p_notices_insert  on public.notices;
drop policy if exists p_notices_update  on public.notices;
drop policy if exists p_notices_delete  on public.notices;

-- INSERT — any teacher/admin/super in this college; enforce created_by = auth.uid()
create policy p_notices_insert on public.notices
  for insert to authenticated
  with check (
    public.current_role() in ('teacher','admin','super')
    and (public.current_role() = 'super' or college_id = public.current_college())
    and (created_by is null or created_by = auth.uid())
  );

-- UPDATE — author (any role above), or admin/super in the same college
create policy p_notices_update on public.notices
  for update to authenticated
  using (
    (created_by = auth.uid() and public.current_role() in ('teacher','admin','super'))
    or (public.current_role() = 'admin' and college_id = public.current_college())
    or  public.current_role() = 'super'
  )
  with check (
    (created_by = auth.uid() and public.current_role() in ('teacher','admin','super'))
    or (public.current_role() = 'admin' and college_id = public.current_college())
    or  public.current_role() = 'super'
  );

-- DELETE — author only for teachers; admin/super can delete anything in college
create policy p_notices_delete on public.notices
  for delete to authenticated
  using (
    (public.current_role() = 'teacher' and created_by = auth.uid())
    or (public.current_role() = 'admin' and college_id = public.current_college())
    or  public.current_role() = 'super'
  );

-- Read policy (already exists from mig 006) — untouched:
--   p_notices_read: same college, or super
