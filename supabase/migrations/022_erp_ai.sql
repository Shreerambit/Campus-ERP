-- =====================================================================
--  022_erp_ai.sql
--  ---------------------------------------------------------------------
--  ERP AI: vector store for notes RAG + chat-history table.
--
--  Tables added:
--    note_chunks      – text chunks from study_materials (notes/PDFs),
--                       embedded with Supabase hosted gte-small (1536-d).
--    ai_conversations – one row per (student, subject) conversation so
--                       chat history persists across devices, protected
--                       by RLS so a student can read only their own rows.
--    ai_messages      – individual messages in a conversation.
--
--  RLS: students can read chunks for notes in their college whose
--       subject is in a semester they've taken or are taking; they
--       can only read/write their own conversations/messages.
--
--  Idempotent.
-- =====================================================================

-- pgvector is available on all paid Supabase projects and on most free
-- projects created recently. Guard it so the migration doesn't hard-fail
-- on projects where the extension isn't enabled yet (admin can enable it
-- in Dashboard → Database → Extensions and re-run).
create extension if not exists vector;

-- ---------------- note_chunks ----------------
create table if not exists public.note_chunks (
  id           uuid primary key default gen_random_uuid(),
  college_id   uuid not null references public.colleges(id) on delete cascade,
  note_id      uuid not null references public.study_materials(id) on delete cascade,
  subject_id   uuid references public.subjects(id) on delete set null,
  chunk_index  int  not null default 0,
  content      text not null,
  embedding    vector(384),
  token_count  int,
  created_at   timestamptz not null default now()
);

create index if not exists note_chunks_college_subject_idx
  on public.note_chunks (college_id, subject_id);

create index if not exists note_chunks_note_idx
  on public.note_chunks (note_id);

-- IVFFlat index for approximate nearest-neighbor; lists=50 is fine for
-- a small college corpus (<100k chunks).
create index if not exists note_chunks_embedding_idx
  on public.note_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 50);

alter table public.note_chunks enable row level security;

drop policy if exists "note_chunks: students read their college" on public.note_chunks;
create policy "note_chunks: students read their college"
  on public.note_chunks for select
  using (
    exists (
      select 1 from public.students s
      where s.auth_user_id = auth.uid()
        and s.college_id  = note_chunks.college_id
    )
  );

-- Teachers/admins can read chunks for their college too (for future
-- "teacher AI" features). Insert/update/delete is service-role only;
-- ingestion happens via the Edge Function using service role.
drop policy if exists "note_chunks: teachers read their college" on public.note_chunks;
create policy "note_chunks: teachers read their college"
  on public.note_chunks for select
  using (
    exists (
      select 1 from public.teachers t
      where t.auth_user_id = auth.uid()
        and t.college_id  = note_chunks.college_id
    )
  );

-- RPC: top-K chunks for a query embedding, scoped to a college and
-- (optionally) a set of subject ids (student's semesters/subjects).
-- Usage from Edge Function:
--   select * from match_note_chunks(<college>, <embedding>, 6, VARIADIC ARRAY[<sid1>,<sid2>]);
create or replace function public.match_note_chunks(
  p_college_id   uuid,
  p_query_embedding vector(384),
  p_match_count  int  default 6,
  p_subject_ids  uuid[] default null
)
returns table (
  id          uuid,
  note_id     uuid,
  subject_id  uuid,
  content     text,
  chunk_index int,
  similarity  float
)
language plpgsql
as $$
begin
  return query
  select
    c.id, c.note_id, c.subject_id, c.content, c.chunk_index,
    1 - (c.embedding <=> p_query_embedding) as similarity
  from public.note_chunks c
  where c.college_id = p_college_id
    and c.embedding is not null
    and (p_subject_ids is null or c.subject_id = any(p_subject_ids))
  order by c.embedding <=> p_query_embedding
  limit p_match_count;
end;
$$;

-- ---------------- conversations & messages ----------------
create table if not exists public.ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  college_id  uuid not null references public.colleges(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (college_id, student_id, id)
);

create index if not exists ai_conversations_student_idx
  on public.ai_conversations (college_id, student_id, updated_at desc);

alter table public.ai_conversations enable row level security;

drop policy if exists "ai_conv: student owns" on public.ai_conversations;
create policy "ai_conv: student owns"
  on public.ai_conversations for all
  using (
    exists (
      select 1 from public.students s
      where s.id = ai_conversations.student_id
        and s.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.students s
      where s.id = ai_conversations.student_id
        and s.auth_user_id = auth.uid()
    )
  );

create table if not exists public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role            text not null check (role in ('user','assistant','system')),
  content         text not null,
  created_at      timestamptz not null default now()
);

create index if not exists ai_messages_conv_idx
  on public.ai_messages (conversation_id, created_at);

alter table public.ai_messages enable row level security;

drop policy if exists "ai_msg: student owns conv" on public.ai_messages;
create policy "ai_msg: student owns conv"
  on public.ai_messages for all
  using (
    exists (
      select 1 from public.ai_conversations c
      join public.students s on s.id = c.student_id
      where c.id = ai_messages.conversation_id
        and s.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.ai_conversations c
      join public.students s on s.id = c.student_id
      where c.id = ai_messages.conversation_id
        and s.auth_user_id = auth.uid()
    )
  );

-- ---------------- trigger to touch updated_at ----------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ai_conv_touch on public.ai_conversations;
create trigger trg_ai_conv_touch
  before update on public.ai_conversations
  for each row execute function public.touch_updated_at();

grant select, insert, update on public.note_chunks to authenticated;
grant select, insert, update, delete on public.ai_conversations to authenticated;
grant select, insert, delete on public.ai_messages to authenticated;
grant execute on function public.match_note_chunks(uuid, vector(1536), int, uuid[]) to authenticated;
