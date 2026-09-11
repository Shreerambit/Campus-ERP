-- =====================================================================
--  Migration 018 — Teacher notes + PDF storage
-- =====================================================================
--
--  Uses the existing public.study_materials table.
--
--  Changes:
--   1. Add `body` (rich text/plain), `target_semester`, `target_section`
--      columns so teachers can add notes without a PDF attachment.
--   2. Rework RLS: teachers can only INSERT/UPDATE/DELETE their OWN
--      notes; all authenticated users in the same college can READ.
--   3. Storage bucket `notes` (public) + policies to upload PDFs.
--
--  Safe to re-run.
-- =====================================================================

------------------------------------------------------------
-- 1. Schema tweaks
------------------------------------------------------------
alter table public.study_materials
  add column if not exists body            text,
  add column if not exists target_semester int,
  add column if not exists target_section  text;

-- `path_or_url` was NOT NULL — relax so a text-only note is allowed
alter table public.study_materials alter column path_or_url drop not null;
-- `kind` should permit 'note' for pure text notes
alter table public.study_materials drop constraint if exists study_materials_kind_check;
alter table public.study_materials
  add constraint study_materials_kind_check
  check (kind is null or kind in ('pdf','ppt','doc','video','link','note'));

create index if not exists idx_material_college_subject
  on public.study_materials(college_id, subject_id, created_at desc);

------------------------------------------------------------
-- 2. RLS: owner-only writes
------------------------------------------------------------
drop policy if exists p_material_read   on public.study_materials;
drop policy if exists p_material_write  on public.study_materials;
drop policy if exists p_material_insert on public.study_materials;
drop policy if exists p_material_update on public.study_materials;
drop policy if exists p_material_delete on public.study_materials;

-- READ: any authenticated user in the same college (students, teachers, parents)
create policy p_material_read on public.study_materials
  for select to authenticated using (
    public.current_role() = 'super' or college_id = public.current_college()
  );

-- INSERT: a teacher (in this college) who owns the subject (assigned_subjects),
--         OR any admin/super in this college.
create policy p_material_insert on public.study_materials
  for insert to authenticated
  with check (
    public.current_role() = 'super'
    or (public.current_role() = 'admin' and college_id = public.current_college())
    or (public.current_role() = 'teacher'
        and college_id = public.current_college()
        and public.teacher_owns_subject(college_id, subject_id))
  );

-- UPDATE: only the author teacher, or admin/super
create policy p_material_update on public.study_materials
  for update to authenticated using (
    public.current_role() = 'super'
    or (public.current_role() = 'admin' and college_id = public.current_college())
    or (public.current_role() = 'teacher'
        and exists (select 1 from public.teachers t
                     where t.id = uploaded_by and t.auth_user_id = auth.uid()))
  ) with check (
    public.current_role() = 'super'
    or (public.current_role() = 'admin' and college_id = public.current_college())
    or (public.current_role() = 'teacher'
        and exists (select 1 from public.teachers t
                     where t.id = uploaded_by and t.auth_user_id = auth.uid()))
  );

-- DELETE: same rules as UPDATE
create policy p_material_delete on public.study_materials
  for delete to authenticated using (
    public.current_role() = 'super'
    or (public.current_role() = 'admin' and college_id = public.current_college())
    or (public.current_role() = 'teacher'
        and exists (select 1 from public.teachers t
                     where t.id = uploaded_by and t.auth_user_id = auth.uid()))
  );

------------------------------------------------------------
-- 3. Auto-stamp uploaded_by with the calling teacher's id
------------------------------------------------------------
create or replace function public.trg_material_stamp_teacher()
returns trigger
language plpgsql
security definer
as $$
declare v_teacher uuid;
begin
  if new.uploaded_by is null then
    select t.id into v_teacher
      from public.teachers t
     where t.auth_user_id = auth.uid()
       and t.college_id  = new.college_id
     limit 1;
    if v_teacher is not null then new.uploaded_by := v_teacher; end if;
  end if;
  return new;
end $$;

drop trigger if exists on_material_stamp_teacher on public.study_materials;
create trigger on_material_stamp_teacher
  before insert on public.study_materials
  for each row execute function public.trg_material_stamp_teacher();

------------------------------------------------------------
-- 4. Storage bucket `notes` — public read, auth write
------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('notes', 'notes', true)
on conflict (id) do update set public = true;

drop policy if exists "notes public read"  on storage.objects;
create policy "notes public read" on storage.objects
  for select to public using (bucket_id = 'notes');

drop policy if exists "notes auth upload"  on storage.objects;
create policy "notes auth upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'notes');

drop policy if exists "notes auth update"  on storage.objects;
create policy "notes auth update" on storage.objects
  for update to authenticated
  using (bucket_id = 'notes') with check (bucket_id = 'notes');

drop policy if exists "notes auth delete"  on storage.objects;
create policy "notes auth delete" on storage.objects
  for delete to authenticated using (bucket_id = 'notes');
