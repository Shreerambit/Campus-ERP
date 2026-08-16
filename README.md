# BCA Campus — Apple-Inspired College ERP PWA

A premium, installable Progressive Web App that combines a **College ERP,
LMS, Attendance system, Student Portal, Teacher Portal and Admin
Dashboard** in one seamless, modern experience. Design language draws
from Apple's Human Interface Guidelines, Material Design 3 and Linear.

> **Branding:** BCA Department · Bagalkot University
> **Seeded students:** 232 real records extracted from your 12 practical
> exam attendance sheets (24 – 29 Apr 2026), across 12 sections **A – L**.

---

## ✨ Highlights

- **Apple-inspired UI** — SF-style typography, glassmorphism, soft
  gradients, large rounded corners, premium shadows, Framer-Motion
  animations at 60 fps.
- **Installable PWA** — service worker, offline cache, app icons,
  splash, app shortcuts (Attendance / Timetable / Leaderboard).
- **Swipe Attendance** — the flagship module. Big center card, next /
  previous cards peek from the sides. **Swipe left → Present**, **swipe
  right → Absent**, tap buttons or use ← / → arrows, **5-second Undo**,
  auto-save, offline-ready. Motivation emoji reacts to attendance %.
- **Real students** — dropdown of 12 sections (A–L) with all your
  extracted rosters; deterministic avatars, ranks, CGPA, attendance %.
- **Student Dashboard** — greeting, today's classes, attendance ring,
  three ranks (Overall / Attendance / CGPA), quick actions, notices,
  animated trend chart.
- **Timetable** — full week; today's card highlighted.
- **Leaderboard** — sort by Overall / CGPA / Attendance, filter by
  section, search by name or reg-no, podium + full table, "You" pill.
- **Academics** — subjects with internal/external/total, assignments,
  labs with progress rings.
- **Leave** — form with auto-filled student data, approval routing
  logic (1–3 days → class teacher, >3 → chairman), history, ready for
  auto-generated PDF (edge function stub in Supabase).
- **Profile** — skills, certificates, achievements, social links.
- **Supabase backend** — full Postgres schema + RLS policies + 232
  real students seeded (`supabase/migrations/20260724_init.sql`).

---

## 🚀 Getting Started

```bash
# 1. Install
cd campus-erp
npm install

# 2. (Optional) connect Supabase
cp .env.example .env.local
# edit values with your project URL + anon key

# 3. Dev
npm run dev            # http://localhost:5173

# 4. Build & preview (PWA is only active in production build)
npm run build
npm run preview
```

---

## 🧱 Tech Stack

| Layer      | Tools |
|------------|-------|
| Frontend   | **React 18 + TypeScript + Vite 5** |
| Styling    | **Tailwind CSS 3**, custom Apple-style design tokens |
| Animation  | **Framer Motion 11** (drag / swipe / spring transitions) |
| Charts     | **Chart.js 4** + `react-chartjs-2` |
| Icons      | **lucide-react** |
| Data / Cache | **@tanstack/react-query** |
| PWA        | **vite-plugin-pwa** + Workbox (CacheFirst / NetworkFirst) |
| Backend    | **Supabase** (Postgres · Auth · Storage · Realtime · Edge Functions) |
| Deployment | **Vercel** (frontend) + **Supabase** (backend) |

---

## 🗄 Database (Supabase)

Everything lives in `supabase/migrations/20260724_init.sql`. Run it in
the Supabase SQL editor or via the CLI:

```bash
supabase db push
```

Tables provisioned:

`profiles`, `departments`, `sections`, `subjects`, `students`,
`teachers`, `timetable`, `attendance`, `marks`, `results`,
`assignments`, `assignment_submissions`, `study_materials`,
`leave_applications`, `fee_receipts`, `notifications`, `events`,
`library_books`, `book_issues`, `placements`, `activity_logs`.

**Row-Level Security** is enabled on all sensitive tables with policies
such as:

- Students can only read their own attendance, marks, results, fee
  receipts and leave records.
- Only admins can insert/update `students` (roll number, department,
  results, etc.).
- Teachers can insert/update `attendance` and `marks`.
- Fees: student inserts, admin verifies.
- Common data (timetable, notices) is readable by any authenticated
  user.

Storage folders you should create:

```
/students/profile-images
/teachers/profile-images
/assignments
/study-materials
/fee-receipts
/leave-documents
/results
/certificates
/projects
/gallery
/events
```

---

## 🗂 Real students (seeded)

232 records were extracted from the 12 Practical Exam Attendance Sheets
you uploaded (Bagalkot University · Python Programming Lab · 24–29
April 2026). They're grouped into sections **A – L**, 20 students per
section (Section L has 12).

Local JSON copy: `data/students.json`.
SQL seed appended at the bottom of the migration file.

---

## 🧩 Adding real Supabase queries

`src/lib/supabase.ts` initialises the client when env vars are
provided. Swap the local static data in `src/lib/students.ts` with:

```ts
const { data } = await supabase.from('students').select('*');
```

React Query is already set up in `src/main.tsx`.

---

## 📱 PWA & Install

Open the production build in Chrome/Safari and use the browser's
"Add to Home Screen" / "Install app". `theme_color`, splash and app
icons are configured in `vite.config.ts`.

App shortcuts are pre-wired for:

- Attendance
- Timetable
- Leaderboard

---

## 🖌 Design tokens

- Colors: `ios-blue #0A84FF`, `ios-indigo #5E5CE6`, `ios-purple #BF5AF2`,
  `ios-pink #FF375F`, `ios-red #FF453A`, `ios-orange #FF9F0A`,
  `ios-green #30D158`, `ios-teal #64D2FF`.
- Radii: `18–32 px`.
- Shadows: `soft`, `card`, `hi`, `glass`.
- Typography: SF Pro Display → Inter → system-ui fallback.

---

## 📎 What's included in this deliverable

- ✅ Complete Vite + React + TS + Tailwind + Framer Motion project.
- ✅ 7 polished pages (Login, Dashboard, Attendance, Timetable,
  Leaderboard, Academics, Leave, Profile).
- ✅ Swipe attendance carousel with the exact behaviour from the spec.
- ✅ PWA manifest, service worker, app shortcuts.
- ✅ Supabase migration with schema, RLS, indexes, seed subjects and
  seeded students.
- ✅ Real student rosters extracted from your 12 PDFs.

Future work (great next iterations): Teacher & Admin dashboards, PDF
generation edge functions for leave letters, push notifications via
Supabase Realtime + Web Push, offline write-queue for attendance sync.
