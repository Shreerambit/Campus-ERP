# Campus-ERP — Fix Pass #7

## Bugs fixed
1. **Teacher blocked with "No subjects assigned for Sem 6"** — even though she was correctly assigned to Sem 5
2. **Roll number wrong everywhere** — was showing `14` instead of `230` (last 3 digits of USN)
3. **All emojis removed** — clean, professional look
4. **Sidebar / login brand cramped** — cleaner layout
5. **Student photo change** — was already built; explaining why it might not have been visible

---

## Deploy — 2 steps

### 1️⃣ Push code
```bash
git add . && git commit -m "fix: teacher sem auto-jump, roll number = USN last3, no emojis, brand cleanup" && git push
```

### 2️⃣ Make sure migration 016 is applied (for student photo upload)

If you haven't run this yet in Supabase SQL Editor, run it now — otherwise photo upload silently fails because the storage bucket doesn't exist:

```sql
-- Storage: avatars bucket + policies (mig 016)
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

---

## What each fix does

### 🔓 Teacher "No subjects for you in Sem 6"
**Root cause:** the app remembers your last-picked semester in `localStorage`. If it happened to be Sem 6 (from an admin previewing that semester), teachers were stuck on Sem 6 where they have no subjects → dead-end screen.

**Fix:** the Attendance page now checks: "does this teacher have any subject in the currently selected semester?" If not, it **silently switches** the scope to the first semester where they DO have subjects.

If the teacher truly has no subjects assigned anywhere, the empty state now:
- Shows which subject codes they ARE assigned to (so they know it's a semester mismatch, not missing data)
- Has a "**Go to Sem X**" button that jumps them to the right one

### 🎯 Roll number = last 3 digits of USN (everywhere)
**Root cause:** the DB `roll_number` column has legacy attendance-sheet serial numbers (e.g. `14`) that don't match your convention. Your rule: **roll number = last 3 chars of the USN**. So `U26ZW24S0230` → Roll `230`.

**Fix:** every place in the app now derives the roll number from the USN, ignoring the DB column:
- Directory cards
- Leaderboard rows
- Attendance student cards
- Attendance review sheet
- Dashboard chip
- **Leave form (student's own)**
- **Leave inbox (teacher's view)** — the "Roll 14" you saw is now the correct 3-digit tail
- Profile page

The DB column stays untouched (it's still used to seed and can be re-purposed later).

### 😶 All emojis removed
Deleted or replaced:
- Dashboard greeting: no more emoji beside the student name
- Attendance ring "🎉" — replaced with plain text
- Attendance student card motivation function — no emoji at all
- **Leaderboard podium 🥇🥈🥉** — replaced with round numbered ranks (1/2/3) in gradient badges (orange for #1, blue for #2, purple for #3). Clean and modern.
- Motivation messages — kept the words, removed the emojis

The app now has a **zero-emoji** design language.

### 🎨 Sidebar / login brand cleanup
**What you saw:** the tiny `[C]` icon + wrapping "Campus ERP" text + "Basaveshwar Science College" looked cramped and awkward.

**Fix:** the `Brand` component in the Shell/topbar now:
- Bigger container (12×12 on desktop, 10×10 on mobile) with a subtle blue gradient background
- Logo inside is `object-cover` so it fills the whole tile
- Slightly larger name text
- Better hierarchy: bold gradient "Campus ERP" over medium college line

Result: reads cleanly on both desktop sidebar and mobile top bar. No wrapping. Consistent premium feel.

### 📸 Student photo change — clarification

The photo upload feature **is already built into the student portal**. Every student can:
1. Open **Profile** page (via the "Signed in" card in the sidebar, or the last icon in the bottom nav)
2. Tap on the profile photo → OR tap the blue **"Change photo"** button below it
3. Pick an image → it uploads to Supabase Storage → the new URL is saved to their `students.photo_url`
4. The new photo instantly appears in the header, directory, leaderboard, etc.

**If it doesn't seem to work,** the `avatars` storage bucket doesn't exist yet in your Supabase project. Run the SQL in Step 2 above and it will work immediately.

**How to verify the bucket exists:**
1. Go to https://supabase.com/dashboard/project/nzxbitngtkjeduwhueks/storage/buckets
2. You should see a bucket named `avatars` (public read)
3. If it's not there → run the SQL

---

## Files touched
- `src/lib/liveData.ts` — `short_roll` derives from `reg_no.slice(-3)`; `sl` derives from same
- `src/lib/students.ts` — `motivationEmoji` returns empty string
- `src/pages/Attendance.tsx` — teacher auto-jumps to their assigned semester; better empty state with jump button
- `src/pages/Dashboard.tsx` — no emoji, no "🎉"
- `src/pages/Leaderboard.tsx` — numbered gradient badges replace 🥇🥈🥉
- `src/pages/Leave.tsx` — roll = `reg_no.slice(-3)` (both student form and teacher inbox)
- `src/pages/Profile.tsx` — roll uses `short_roll` (derived)
- `src/components/Shell.tsx` — Brand tile bigger, cleaner
