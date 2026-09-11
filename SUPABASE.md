# 🔗 Connecting Campus ERP to Supabase

Follow these steps once. After this, every device that uses the app talks to your real database.

---

## 1  ·  Get your Supabase credentials

1. Open your project on **https://supabase.com/dashboard**
2. Click **Project Settings** (gear icon, bottom-left)
3. Open the **API** tab
4. Copy two values:
   - **Project URL** → looks like `https://xxxxxxxxxxxxxxxx.supabase.co`
   - **`anon` `public` key** → long string starting with `eyJhbGci...`

> ✅ The **anon key is safe** to ship in the frontend — Row-Level Security policies protect your data.
> ❌ Never paste your **`service_role`** key into `.env.local` or GitHub.

---

## 2  ·  Add them to the project

Create a file called **`.env.local`** in the project root (same folder as `package.json`):

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Then restart the dev server:

```bash
npm run dev
```

The app auto-detects the config and switches from local demo data → real Supabase. Everything still works if these are missing (offline demo mode).

For **Vercel** deployment: Dashboard → Project → Settings → Environment Variables → add the same two.

---

## 3  ·  Create the database tables

In your Supabase dashboard, open **SQL Editor** and run these files in order:

| Order | File | Purpose |
|---|---|---|
| 1 | `supabase/migrations/001_schema.sql` | All tables, indexes, triggers |
| 2 | `supabase/migrations/002_rls.sql` | Row-Level Security policies |
| 3 | `supabase/migrations/003_seed.sql` | Colleges + departments + courses + sections |
| 4 | `supabase/migrations/004_seed_students.sql` | *(Optional)* 232 real BVVS students from your PDFs |
| 5 | `supabase/migrations/005_bootstrap.sql` | *After you create users*, promote them to admin/super |

Copy each file's contents, paste into the SQL editor, click **Run**.

---

## 4  ·  Create your first users

Users are created in **Supabase Authentication**, then their `profiles` row gets the right role.

### 👑 Super Admin (you)

1. Supabase Dashboard → **Authentication** → **Users** → **Add User**
2. Email: `you@example.com` · Password: `whatever-you-want`
3. In SQL Editor, run (edit the email):
   ```sql
   update public.profiles
      set role = 'super', full_name = 'Platform Owner'
    where id = (select id from auth.users where email = 'you@example.com');
   ```

### 🏫 College Admin (per college)

1. Add User: `bvvs-admin@example.com` / password
2. Run:
   ```sql
   update public.profiles
      set role = 'admin',
          full_name = 'BVVS Admin',
          college_id = '11111111-1111-1111-1111-111111111111'
    where id = (select id from auth.users where email = 'bvvs-admin@example.com');
   ```

### 👨‍🏫 Teacher

Same pattern — see `005_bootstrap.sql` for the exact SQL.

### 👨‍🎓 Students

The **best UX** is: college admin uploads the class list via the Import Center in the app. That inserts rows into `public.students` — the admin then creates auth users for each (or you can use the SQL below to bulk-create them):

```sql
-- Create auth users for all BVVS students whose reg_no starts with U26.
-- Password = DOB (yyyy-mm-dd). If DOB is null, uses a fixed placeholder.
do $$
declare s record;
begin
  for s in
    select * from public.students
    where college_id = '11111111-1111-1111-1111-111111111111'
      and auth_user_id is null
  loop
    -- NOTE: This is illustrative. In production create auth users via
    -- Supabase Admin API (server-side) — SQL alone cannot insert into
    -- auth.users because password hashing must go through GoTrue.
    raise notice 'Create user for %', s.reg_no;
  end loop;
end $$;
```

**Recommended:** create an Edge Function that iterates through `students` and calls `supabase.auth.admin.createUser({ email, password: dob })` — this is trivial and I can add it next if you like.

---

## 5  ·  How the app now uses Supabase

| Feature | Reads from | Writes to |
|---|---|---|
| Welcome / role picker | — | — |
| College picker in login | `public.colleges` | — |
| Dept / course / section pickers | `public.departments/courses/sections` | — |
| Student login | `auth.signInWithPassword` | — |
| Teacher / Admin / Parent / Super login | `auth.signInWithPassword` | — |
| Session restore | `auth.getSession` + `public.profiles` | — |
| First-login change password | — | `auth.updateUser` + `public.students.password_changed` |
| Import Center → Students | — | `public.students` (upsert on `college_id + reg_no`) |
| Profile edits | — | `public.students` (own row only) |
| Super Admin colleges CRUD | `public.colleges` | `public.colleges` |

Everything else (leaderboard, timetable, attendance, marks, results, leave, fees, notifications, events) has tables and RLS ready. Hook them up with the existing `fetchStudents()` / `upsertStudents()` pattern in `src/lib/db.ts`.

---

## 6  ·  Storage buckets

Create these in **Supabase Dashboard → Storage → New Bucket**. Set them to **Public** unless noted.

| Bucket | Purpose |
|---|---|
| `avatars` | Student & teacher profile photos |
| `assignments` | Student submissions (Private) |
| `materials` | PDFs, PPTs, videos |
| `fees` | Receipts (Private) |
| `leave` | Leave attachments (Private) |
| `results` | Result PDFs (Private) |
| `events` | Posters |

---

## 7  ·  Confirm the connection works

Open the app in dev mode:

```bash
npm run dev
```

Then in **DevTools → Console**, run:

```js
window.__campus?.supabase?.auth.getSession().then(console.log)
```

If it prints an object (not `null`), Supabase is wired up correctly.

Or simply try signing in — if the wrong password gives an "Invalid credentials" error message from the server, you're live.

---

## 8  ·  Troubleshooting

- **"Registration number not found"** — the student isn't in `public.students` yet, or belongs to a different college. Import them via the Import Center as the college admin.
- **CORS errors** — Supabase Dashboard → **Authentication → URL Configuration** → add `http://localhost:5173` and your Vercel URL.
- **RLS blocks a read** — you're missing a role on your `profiles` row, or `college_id` is null. Re-run the appropriate bootstrap SQL.
- **Import Center says "not configured"** — env vars aren't loaded. Restart `npm run dev` after editing `.env.local`.
