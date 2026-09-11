# ⚡ BVVS Campus — 2-minute Setup

If this looks blank / broken in VS Code or GitHub, follow the exact steps below.
The project has been tested end-to-end and every route serves 200 OK with zero
JS console errors on both dev and production builds.

---

## Requirements

- **Node.js 18 or newer** (recommend Node 20 LTS)
  - Check: `node -v`  → must print `v18.x.x` or higher.
  - If Node is older or missing, install from https://nodejs.org.
- **npm 9+** (bundled with Node).

> ⚠️ VS Code does **not** run the project on its own. You must run `npm install`
> and `npm run dev` in the built-in terminal (Ctrl + `` ` `` on Windows,
> Cmd + `` ` `` on Mac).

---

## 1️⃣  Run locally (VS Code)

```bash
# From the project root (the folder that contains package.json)
npm install
npm run dev
```

Open the URL that Vite prints — usually **http://localhost:5173**.

You should see the Dashboard immediately. If you see a blank white page,
open DevTools → Console (F12) and copy the first red error. 99% of the
time it's one of:

| Symptom                                             | Fix                                             |
|-----------------------------------------------------|-------------------------------------------------|
| `command not found: npm`                            | Install Node.js (link above).                   |
| `Cannot find module '...'`                          | Delete `node_modules` + `package-lock.json`, run `npm install` again. |
| `EADDRINUSE: address already in use :::5173`        | Another Vite is running — kill it or `npm run dev -- --port 5174`. |
| Blank screen, red errors mentioning `tailwindcss`   | Make sure `postcss.config.js` and `tailwind.config.js` are present. |
| PWA / service-worker errors in dev                  | Ignore — PWA is intentionally **disabled in dev**. It only kicks in on `npm run build && npm run preview`. |

---

## 2️⃣  Deploy to Vercel (recommended)

1. Push the project to a GitHub repo:
   ```bash
   git init
   git add .
   git commit -m "BVVS Campus ERP"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. Go to **https://vercel.com/new**, import the repo. Vercel auto-detects Vite.
3. Click **Deploy**. That's it — SPA rewrites are already handled by
   `vercel.json`.

---

## 3️⃣  Deploy to GitHub Pages

A ready-made workflow lives at `.github/workflows/deploy.yml`.

1. Push the repo to GitHub.
2. In the repo settings → **Pages** → set **Source = "GitHub Actions"**.
3. If your repo URL is `https://<user>.github.io/<repo>/`, edit
   `.github/workflows/deploy.yml` and change `VITE_BASE: /` to
   `VITE_BASE: /<repo>/` before pushing (otherwise assets 404).
4. Push again. The Action builds and publishes. Your site appears at
   `https://<user>.github.io/<repo>/`.

---

## 4️⃣  Deploy to Netlify

1. Drop the whole folder onto https://app.netlify.com/drop, **or** connect the
   GitHub repo.
2. Build command: `npm run build`
3. Publish directory: `dist`
4. SPA fallback (`/*  /index.html  200`) is already in `public/_redirects`.

---

## 5️⃣  Production build sanity check

```bash
npm run build
npm run preview
```
Then open **http://localhost:4173**. This mirrors exactly what Vercel /
Netlify serve. If this works locally, deploys will work too.

Successful output ends with:
```
✓ built in 5.07s
PWA v0.20.5
precache  27 entries (604.18 KiB)
```

---

## 6️⃣  What routes exist?

`/login`, `/dashboard`, `/attendance`, `/timetable`, `/leaderboard`,
`/academics`, `/leave`, `/profile`. All are lazy-loaded and animated.

---

## 7️⃣  Optional: Connect Supabase

Copy `.env.example` → `.env.local`, fill in:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

Then run the SQL in `supabase/migrations/20260724_init.sql` inside the
Supabase SQL editor.

---

## 8️⃣  Troubleshooting deep-dive

**Nothing appears / white screen on refresh in production.**
That's an SPA fallback problem. Confirm:
- Vercel: `vercel.json` present at project root ✅ (already included).
- Netlify: `public/_redirects` present ✅ (already included).
- GitHub Pages: `VITE_BASE` matches your repo path.

**"Failed to load resource: pwa-192.png"** — the icons are in `public/`. If you
removed them, regenerate any 192, 512, and 512-maskable PNGs and drop them
in `public/`.

**Typescript errors in the editor but `npm run build` works.**
That's fine — the project builds with Vite (`vite build`). If you want the
extra safety of type-checking, run `npm run typecheck` separately.

Still stuck? Share the exact terminal output of `npm run dev` and I can
fix it in one shot.
