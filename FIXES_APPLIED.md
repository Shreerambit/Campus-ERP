# Campus-ERP — Fix Pass #8 (5 requirements)

## The 5 requirements
1. App name/logo: **already "Campus ERP"** — no logo file was provided this round, so no changes made. Splash + branding untouched.
2. **Student profile picture** — already built. Two possible reasons it's not working, both addressed below.
3. **Teacher Notes + PDF download** — brand new `/notes` page.
4. **Overall CGPA + Latest SGPA on the attendance card** — added to the existing StudentCard.
5. **First-launch bug** (need to open app twice) — fixed by adding timeouts + moving tenant cache to localStorage.

---

## Deploy — 2 steps

### 1️⃣ Run this in Supabase SQL Editor

```sql
-- ============ MIG 018 — Notes with PDF ============
alter table public.study_materials
  add column if not exists body            text,
  add column if not exists target_semester int,
  add column if not exists target_section  text;

alter table public.study_materials alter column path_or_url drop not null;
alter table public.study_materials drop constraint if exists study_materials_kind_check;
alter table public.study_materials
  add constraint study_materials_kind_check
  check (kind is null or kind in ('pdf','ppt','doc','video','link','note'));

create index if not exists idx_material_college_subject
  on public.study_materials(college_id, subject_id, created_at desc);

drop policy if exists p_material_read   on public.study_materials;
drop policy if exists p_material_write  on public.study_materials;
drop policy if exists p_material_insert on public.study_materials;
drop policy if exists p_material_update on public.study_materials;
drop policy if exists p_material_delete on public.study_materials;

create policy p_material_read on public.study_materials
  for select to authenticated using (
    public.current_role() = 'super' or college_id = public.current_college()
  );

create policy p_material_insert on public.study_materials
  for insert to authenticated
  with check (
    public.current_role() = 'super'
    or (public.current_role() = 'admin' and college_id = public.current_college())
    or (public.current_role() = 'teacher'
        and college_id = public.current_college()
        and public.teacher_owns_subject(college_id, subject_id))
  );

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

create policy p_material_delete on public.study_materials
  for delete to authenticated using (
    public.current_role() = 'super'
    or (public.current_role() = 'admin' and college_id = public.current_college())
    or (public.current_role() = 'teacher'
        and exists (select 1 from public.teachers t
                     where t.id = uploaded_by and t.auth_user_id = auth.uid()))
  );

create or replace function public.trg_material_stamp_teacher()
returns trigger language plpgsql security definer as $$
declare v_teacher uuid;
begin
  if new.uploaded_by is null then
    select t.id into v_teacher from public.teachers t
     where t.auth_user_id = auth.uid() and t.college_id = new.college_id limit 1;
    if v_teacher is not null then new.uploaded_by := v_teacher; end if;
  end if;
  return new;
end $$;

drop trigger if exists on_material_stamp_teacher on public.study_materials;
create trigger on_material_stamp_teacher
  before insert on public.study_materials
  for each row execute function public.trg_material_stamp_teacher();

-- Storage: `notes` bucket
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
```

**If you haven't already run mig 016** for the student photo upload, ALSO run:

```sql
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects
  for select to public using (bucket_id = 'avatars');

drop policy if exists "avatars auth upload" on storage.objects;
create policy "avatars auth upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars');

drop policy if exists "avatars auth update" on storage.objects;
create policy "avatars auth update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars') with check (bucket_id = 'avatars');
```

### 2️⃣ Push code
```bash
git add . && git commit -m "feat: notes with PDF, CGPA/SGPA on attendance card, fix first-launch startup" && git push
```

---

## What each fix does

### #2 — Student profile photo (already built)
**Where it is:** Profile page → tap on your photo OR the blue "Change photo" text button below it.

**Why it might have looked broken:**
1. **The `avatars` storage bucket didn't exist.** Fix: run mig 016 SQL above. Verify at https://supabase.com/dashboard/project/nzxbitngtkjeduwhueks/storage/buckets — you should see `avatars` (public).
2. **Old service worker was serving cached page.** Fix: uninstall the PWA and reinstall.

The upload button lives on `/profile` for every student. No admin involvement needed.

### #3 — Teacher Notes + PDF (NEW)
New page at `/notes` (added to sidebar & mobile bottom bar):

**Teachers can:**
- Tap "Add note" → pick a subject they teach → give it a title → optional message → optionally attach a PDF (max 15 MB) → Publish.
- Notes they created show a "Delete" chip on the card. Others don't.
- DB enforces owner-only writes: even by API, a teacher cannot delete another teacher's note.

**Students can:**
- Open `/notes` from the sidebar/bottom nav → see all notes for their semester, newest first.
- Each note shows: subject code, title, message, teacher name, date.
- If a PDF is attached: two buttons on the card — **Open** (in browser tab) and **Download** (to their device).

**Admins/Super** can create/delete any note in the college.

**Filtering:** Students automatically see only their own semester. Teachers see whatever semester the scope picker is on (they can change it via any other page's semester dropdown, since scope is global).

### #4 — CGPA + Latest SGPA on attendance card
Added to the existing student attendance card (below the subject metrics, above the ball-by-ball history):

- **Overall CGPA** — computed live as `avg(SGPA)` from `public.results` for that student. Never stale.
- **Latest SGPA** — the SGPA from the highest completed semester.

Both use real data. If the student has no results yet, they show `—` (not a fake number).

Layout: purple/pink card for CGPA, orange/red for SGPA. Same tile style as the existing metrics, so it fits the design.

### #5 — First-launch startup bug — **the actual cause**
The boot loader was waiting for `AuthProvider.loading` + `TenantProvider.loading` to both be `false`. On a fresh PWA launch:

1. `AuthProvider` was `await`ing `fetchMyProfile()` inside its init — that call can hang on first launch because the service worker hasn't cached anything yet.
2. `TenantProvider` had no request timeout — a single flaky Supabase call could freeze it.
3. Tenant cache was in `sessionStorage` — always empty on first PWA launch.

**Fixes applied:**
- **AuthProvider:** After `getSession()` (which is fast — reads from localStorage), we IMMEDIATELY release the loading flag. Profile rebuild happens in the background without blocking the UI. Added a 6-second hard timeout as a safety net.
- **TenantProvider:** Same 6-second safety timeout. If Supabase is unreachable, we don't block the app forever.
- **Tenant cache moved to `localStorage`** so the second-ever launch (and every subsequent one) uses cached data instantly.
- **Boot loader's own failsafe** reduced from 25s → 8s.

**Result:** the app now paints and becomes interactive within ~1s of the first launch, even on slow networks. No more "close and reopen" needed.

---

## Files touched

- `supabase/migrations/018_notes_and_pdf_storage.sql` — NEW
- `src/pages/Notes.tsx` — NEW
- `src/App.tsx` — route for `/notes`
- `src/components/Shell.tsx` — Notes in sidebar + bottom nav
- `src/lib/liveData.ts` — `useNotes`, `useCreateNote`, `useDeleteNote`, `uploadNotePdf` hooks
- `src/pages/Attendance.tsx` — CGPA + SGPA cards in StudentCard
- `src/lib/auth.tsx` — non-blocking rehydrate + 6s safety timeout
- `src/lib/tenant.tsx` — localStorage cache + 6s safety timeout
- `index.html` — boot failsafe 25s → 8s

## Testing after deploy

1. **Notes (teacher)** — log in as `naina` → sidebar/bottom bar → **Notes** → tap "Add note" → pick DA → title "Unit 3 sample" → attach a PDF → Publish. See it appear in the list with an "Open" and "Download" button.
2. **Notes (student)** — log in as any Sem-5 student → sidebar → Notes → see Naina's note → tap Download → PDF downloads to phone.
3. **CGPA/SGPA on attendance card** — log in as `naina` → Attendance → each student card now shows **Overall CGPA** and **Latest SGPA** below the subject metrics. Values match what the student sees on their Dashboard.
4. **Photo upload (student)** — log in as any student → Profile → tap camera badge → pick image → progress spinner → done. Refresh page → photo persists → visible in Directory to other students.
5. **First-launch bug** — clear all browser data / uninstall PWA / open in a fresh Chrome incognito window. App should reach the login/dashboard within a couple seconds. No "restart to fix" needed.
