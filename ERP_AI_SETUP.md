# ERP AI — Setup & Deploy

ERP AI is the personal academic intelligence layer inside Campus ERP. It ships
as a native page (`/erp-ai`) plus two Supabase Edge Functions.

## What was added
- `src/pages/ErpAI.tsx` — Dashboard + streaming chat (student only)
- `src/lib/erpAi.ts` — typed client (no API keys ever reach the browser)
- `supabase/migrations/022_erp_ai.sql` — pgvector chunks, conversations, messages, RLS
- `supabase/functions/erp-ai/*` — chat streaming + snapshot + CGPA plan endpoints
- `supabase/functions/ingest-note/*` — chunk + embed notes (call after upload)
- `supabase/functions/_shared/*` — shared LLM/academic/RAG helpers
- Nav item, Dashboard promo card, and `/erp-ai` route (student-only)

## 1. Supabase project setup

In Supabase Dashboard:

1. **Enable pgvector:** Database → Extensions → search `vector` → Enable.
2. **Run migration 022** in SQL Editor (paste `supabase/migrations/022_erp_ai.sql`).
   - Verify: `select count(*) from note_chunks;` returns 0, no errors.
3. **Enable the hosted embedding endpoint** (Supabase `embed` function using
   `gte-small`, 384-d):
   - Dashboard → Edge Functions → if `embed` is not already deployed in your
     project, you can deploy the official Supabase `embed` template once:
     ```
     supabase functions deploy embed
     ```
     (If your project already has it available, you can skip this step. The
     RAG helper degrades gracefully: if embedding is down it returns 0
     chunks and AI answers from academic data only.)

## 2. Secrets (Supabase Dashboard → Edge Functions → Secrets)

Add these secrets:

| Key | Value |
|---|---|
| `GROQ_API_KEY` | `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` *(already provided)* |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` (secret) |
| `SB_PROJECT_REF` | Your Supabase project ref (e.g. `nzxbitngtkjeduwhueks`) — the subdomain of your Supabase URL |

The SUPABASE_URL/SUPABASE_ANON_KEY are injected automatically at runtime; no
need to set them.

## 3. Deploy Edge Functions

From this repo (requires Supabase CLI ≥ 1.150):

```bash
npm i -g supabase
supabase login
supabase link --project-ref nzxbitngtkjeduwhueks
supabase functions deploy erp-ai --no-verify-jwt
supabase functions deploy ingest-note --no-verify-jwt
```

(JWT auth is verified inside the function; the `--no-verify-jwt` flag is
needed only if your project's function config blocks unauthenticated OPTIONS
preflight — you can omit it if your project works with the default.)

## 4. Verify the API (from browser dev console after logging in as a student)

```js
const { data } = await supabase.functions.invoke('erp-ai', { body: { action: 'snapshot' } });
console.log(data.snapshot.student.name, 'CGPA:', data.snapshot.cgpa);
```

Should print your name + CGPA without asking who you are.

## 5. Ingest existing notes

Call `ingest-note` once per existing note (or from a server-side script) to
populate `note_chunks`:

```js
const { data: notes } = await supabase.from('study_materials').select('id');
for (const n of notes) {
  await supabase.functions.invoke('ingest-note', { body: { note_id: n.id } });
}
```

After deployment, you can also wire a Database Trigger on `study_materials`
to call `ingest-note` automatically via `pg_net` whenever a teacher uploads
a new note (this is a follow-up improvement — not required for MVP).

## 6. Security model (recap)

- Identity comes from the Supabase JWT → `auth.users.id` → `students.auth_user_id`.
  The student never sends an ID; the server resolves it.
- Every Postgres query inside `erp-ai` uses the user's JWT client (RLS applies).
  Only the vector embedding call uses service role, scoped to the resolved
  `college_id`.
- Non-students get HTTP 403.
- GROQ key lives only in Edge Function secrets — never exposed to the browser.
- AI system prompt tells the model: snapshot numbers are authoritative, never
  invent numbers, never talk about other students, cite retrieved notes.

## 7. Model choice

Default: Groq `llama-3.1-70b-versatile` (fast, cheap, long context). To switch
models (e.g. `llama-3.1-8b-instant` for speed, or `mixtral-8x7b-32768`), set
the `AI_MODEL` secret to the model id and re-deploy.
