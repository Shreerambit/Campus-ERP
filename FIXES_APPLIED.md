# Campus-ERP — Bug Fix Pass #2 (items 21–28)

## What you need to do RIGHT NOW

### 1️⃣ Run migration 014 in Supabase SQL Editor

Open https://supabase.com/dashboard/project/nzxbitngtkjeduwhueks/sql
and paste the contents of **`supabase/migrations/014_unified_access.sql`** and hit Run.

This unlocks the roster for students (they were being blocked by RLS from seeing anyone but themselves) and creates two views used everywhere:
- `v_students_public` — public academic columns only (no phone/email/DOB)
- `v_student_attendance` — real attendance % per student, one row each

### 2️⃣ Push & redeploy
```bash
git add . && git commit -m "fix: unified academic data source, strict rank tabs, student directory RLS" && git push
```
Then on your phone: uninstall PWA → reinstall.

---

## What changed and why

### 🎯 Root cause of #21 (student saw only themselves)

The RLS policy on `public.students` was:
```
teachers/admins see all; students see only their own row.
```
Now:
```
Any authenticated user in the same college sees the whole roster.
```
Private columns are hidden by the app UI (StudentProfile shows only public fields) and by the new `v_students_public` view as defence-in-depth.

Students still **cannot write** anything — that's enforced by the absence of INSERT/UPDATE/DELETE policies for their role. Only teachers/admins can write marks/attendance; only admins can write results.

### 📊 One data source across every page (#22, #23, #24)

New hook **`useCollegeStudentsWithAttendance()`** returns the roster + real attendance percentages in a single query, pulled from `v_student_attendance`. Now used by:
- Directory
- Rankings (Leaderboard)
- Student Profile (for computing ranks)

Same numbers appear everywhere. Dashboard's `useStudentRanks` was also switched to use the same view, so its ranks match.

### 🏆 Strict per-tab sorting in Rankings (#22)

Each tab now uses **only** its own metric — no combined formulas leaking between tabs:

| Tab | Sort by | Value shown per row |
|---|---|---|
| Overall | `0.6·CGPA + 0.4·Attendance` (normalized) | CGPA |
| CGPA | CGPA (desc) | CGPA |
| Latest SGPA | SGPA (desc) | SGPA |
| Attendance | Attendance % (desc) | Attendance % |

Ties are broken alphabetically by name so the order is fully deterministic.

The row's secondary metric also swaps: on the Attendance tab you see CGPA underneath; on other tabs you see attendance underneath.

### 🎓 Student Directory now matches Teacher Directory (#21)

- Same query, same filters (dept / semester / section / search).
- Students can search by Name / USN / Roll.
- Cards now show Course · Sem · Section on the front (was missing).
- Rank column is now computed live from the same roster (was always "#0" because it was reading a stale field).
- Tapping any student → opens their public profile (already worked).

### 🔒 Permissions summary (#26, #27, #28)

**Enforced at the database level:**

| Table | Student | Teacher | Admin |
|---|---|---|---|
| students | read all (same college), update own row | read all | full CRUD |
| results | read all (same college) | read all | full CRUD |
| marks | read all (same college) | read + write | full CRUD |
| attendance | read all (same college) | read + write | full CRUD |
| timetable | read all | read all + admin can upload | full CRUD |
| notices | read all | read + create | full CRUD |

Students cannot edit anyone's marks/attendance/results — trying will fail with an RLS error at the DB, not just a UI check.

### 🧑‍🏫 Teacher access (#25)

Teachers can already:
- View all students in the college (Directory).
- Open any student's public profile.
- Mark & edit attendance for any section (they pick section from the global scope switcher).
- View marks, results, timetables, rankings.

The scope-picker (Sem/Section) persists across pages and reloads, so a teacher who selects Sem V Section A once stays there until they change it.

---

## Testing after deploy

1. Log in as a student — **Directory should show all 244 students** (previously only you).
2. Rankings tab switch — click **CGPA** → top student is the one with highest CGPA. Click **Attendance** → order should be completely different. Click **Latest SGPA** → different again.
3. Open any peer's profile from Directory or Rankings — no email/phone/address should be visible.
4. Log in as teacher `naina` — should see the same Directory and same Rankings numbers as the student sees.
5. Try to hack: as a student, open browser DevTools console and run:
   ```js
   fetch('https://nzxbitngtkjeduwhueks.supabase.co/rest/v1/marks',
     { method: 'POST', headers: { apikey: '<anon>', authorization: 'Bearer ' + (await supabase.auth.getSession()).data.session.access_token, 'Content-Type': 'application/json' },
       body: JSON.stringify({ ... }) })
   ```
   Should get `401` / `403` — student write policies do not exist.

## Files touched in this pass

**Added:**
- `supabase/migrations/014_unified_access.sql`

**Edited:**
- `src/lib/liveData.ts` — added `useCollegeStudentsWithAttendance`, simplified `useStudentRanks`
- `src/pages/Leaderboard.tsx` — strict per-tab sorting, correct row values
- `src/pages/Directory.tsx` — attendance-enriched hook, live-computed rank chip, extra card metadata
- `src/pages/StudentProfile.tsx` — ranks computed from shared roster (no separate query)
