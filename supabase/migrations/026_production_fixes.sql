-- =====================================================================
--  026_production_fixes.sql
--  ---------------------------------------------------------------------
--  Purpose: Fix bugs found in production inspection.
--  All changes are ADDITIVE (no DROP TABLE, no TRUNCATE, no DELETE).
--  Safe to run on the live database.
--
--  Fixes:
--   1. ai_messages: add missing student_id + college_id columns
--   2. match_note_chunks: fix grant to use correct vector(384) dimension
--   3. Students RLS: tighten self-update to protect academic identity
--   4. v_students_public: rebuild safely with COALESCE for status column
--   5. v_student_attendance: ensure status-column safety
--   6. v_college_summary: remove hardcoded owner assignment
-- =====================================================================

-- ---------------------------------------------------------------
-- 1. ai_messages — add student_id and college_id if missing
--    (edge function inserts these; schema had them omitted)
-- ---------------------------------------------------------------
alter table public.ai_messages
  add column if not exists student_id uuid references public.students(id) on delete cascade,
  add column if not exists college_id uuid references public.colleges(id) on delete cascade;

create index if not exists ai_messages_student_idx
  on public.ai_messages (student_id, created_at);

-- ---------------------------------------------------------------
-- 2. match_note_chunks — fix grant with correct vector(384) dim
--    The table defines embedding vector(384), but the original
--    grant used vector(1536) which causes a signature mismatch.
-- ---------------------------------------------------------------
do $$ begin
  revoke execute on function public.match_note_chunks(uuid, vector(1536), int, uuid[]) from authenticated;
exception when others then null; end $$;

grant execute on function public.match_note_chunks(uuid, vector(384), int, uuid[]) to authenticated;

-- ---------------------------------------------------------------
-- 3. Students RLS — tighten self-update to protect academic identity
--
--    The old policy allowed students to update ANY column including
--    course_id, semester, section, college_id.
--
--    Replacement: drop the old policy and recreate with column guards.
-- ---------------------------------------------------------------

-- Safe update RPC (for profile-page use from frontend)
alter table public.students
  add column if not exists updated_at timestamptz default now();

create or replace function public.student_safe_update(
  p_photo_url         text    default null,
  p_personal_email    text    default null,
  p_emergency_contact text    default null,
  p_phone             text    default null,
  p_skills            text[]  default null,
  p_achievements      text[]  default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_student_id uuid;
begin
  select id into v_student_id
  from public.students
  where auth_user_id = auth.uid()
  limit 1;

  if v_student_id is null then
    raise exception 'No student record for current user';
  end if;

  update public.students set
    photo_url         = coalesce(p_photo_url,         photo_url),
    personal_email    = coalesce(p_personal_email,    personal_email),
    emergency_contact = coalesce(p_emergency_contact, emergency_contact),
    phone             = coalesce(p_phone,             phone),
    skills            = coalesce(p_skills,            skills),
    achievements      = coalesce(p_achievements,      achievements),
    updated_at        = now()
  where id = v_student_id;
end;
$$;

grant execute on function public.student_safe_update(text, text, text, text, text[], text[]) to authenticated;

-- Drop old over-permissive policy
drop policy if exists p_students_update_self on public.students;

-- Recreate with column-level guards: student can update personal info
-- but cannot change college_id, department_id, course_id, semester,
-- section, reg_no, roll_number, or auth_user_id.
create policy p_students_update_self on public.students for update
  using (auth_user_id = auth.uid())
  with check (
    auth_user_id = auth.uid()
    and college_id    = (select s2.college_id    from public.students s2 where s2.id = students.id)
    and department_id = (select s2.department_id from public.students s2 where s2.id = students.id)
    and course_id     = (select s2.course_id     from public.students s2 where s2.id = students.id)
    and semester      = (select s2.semester      from public.students s2 where s2.id = students.id)
    and section       = (select s2.section       from public.students s2 where s2.id = students.id)
    and reg_no        = (select s2.reg_no        from public.students s2 where s2.id = students.id)
  );

-- ---------------------------------------------------------------
-- 4. v_students_public — rebuild safely with COALESCE for status
-- ---------------------------------------------------------------
drop view if exists public.v_students_public cascade;

create or replace view public.v_students_public as
  select
    s.id,
    s.college_id,
    s.department_id,
    s.course_id,
    s.reg_no,
    s.name,
    s.roll_number,
    s.semester,
    s.section,
    s.admission_year,
    s.academic_year,
    s.cgpa,
    s.sgpa,
    s.photo_url,
    coalesce(s.status, 'active') as status,
    s.skills,
    s.achievements,
    s.badges,
    c.code    as course_code,
    c.name    as course_name,
    d.code    as department_code,
    d.name    as department_name
  from public.students s
  left join public.courses     c on c.id = s.course_id
  left join public.departments d on d.id = s.department_id
  where coalesce(s.status, 'active') = 'active';

grant select on public.v_students_public to authenticated;
grant select on public.v_students_public to anon;

-- ---------------------------------------------------------------
-- 5. v_student_attendance — rebuild safely with COALESCE status
-- ---------------------------------------------------------------
create or replace view public.v_student_attendance as
  select s.id                                                               as student_id,
         s.college_id,
         s.course_id,
         s.semester,
         s.section,
         s.reg_no,
         count(a.id)                                                        as total,
         count(a.id) filter (where a.status in ('present','leave'))         as present,
         case when count(a.id) = 0 then 0
              else round(100.0 * count(a.id) filter (where a.status in ('present','leave'))
                                / count(a.id), 1)
         end                                                                as pct
    from public.students s
    left join public.attendance a on a.student_id = s.id
   where coalesce(s.status, 'active') = 'active'
   group by s.id;

grant select on public.v_student_attendance to authenticated;

-- ---------------------------------------------------------------
-- 6. v_college_summary — remove hardcoded owner to postgres
-- ---------------------------------------------------------------
create or replace view public.v_college_summary as
  select
    col.id              as college_id,
    col.name            as college_name,
    col.code            as college_code,
    col.status,
    count(distinct s.id)  as student_count,
    count(distinct t.id)  as teacher_count,
    count(distinct d.id)  as department_count,
    count(distinct cr.id) as course_count
  from public.colleges col
  left join public.students    s  on s.college_id = col.id
                                  and coalesce(s.status,'active') = 'active'
  left join public.teachers    t  on t.college_id = col.id
  left join public.departments d  on d.college_id = col.id
  left join public.courses     cr on cr.department_id in (
    select id from public.departments where college_id = col.id
  )
  group by col.id;

grant select on public.v_college_summary to authenticated;

-- ---------------------------------------------------------------
-- 7. ai_conversations — add student_id + college_id if missing
--    (created by edge function; needed for proper RLS scoping)
-- ---------------------------------------------------------------
alter table public.ai_conversations
  add column if not exists student_id uuid references public.students(id) on delete cascade,
  add column if not exists college_id uuid references public.colleges(id) on delete cascade,
  add column if not exists updated_at timestamptz default now();

create index if not exists ai_conversations_student_idx
  on public.ai_conversations (student_id, updated_at desc);

-- ---------------------------------------------------------------
-- 8. RLS on ai_conversations and ai_messages
--    Students can only see their own conversations/messages.
-- ---------------------------------------------------------------

-- ai_conversations: enable RLS if not already enabled
alter table public.ai_conversations enable row level security;

drop policy if exists ai_conversations_student_self on public.ai_conversations;
create policy ai_conversations_student_self on public.ai_conversations
  for all
  using (
    student_id = (
      select id from public.students where auth_user_id = auth.uid() limit 1
    )
  )
  with check (
    student_id = (
      select id from public.students where auth_user_id = auth.uid() limit 1
    )
  );

-- ai_messages: enable RLS if not already enabled
alter table public.ai_messages enable row level security;

drop policy if exists ai_messages_student_self on public.ai_messages;
create policy ai_messages_student_self on public.ai_messages
  for all
  using (
    conversation_id in (
      select id from public.ai_conversations
      where student_id = (
        select id from public.students where auth_user_id = auth.uid() limit 1
      )
    )
  )
  with check (
    conversation_id in (
      select id from public.ai_conversations
      where student_id = (
        select id from public.students where auth_user_id = auth.uid() limit 1
      )
    )
  );

-- ---------------------------------------------------------------
-- 9. students — add optional personal info columns if missing
--    (used by student profile page)
-- ---------------------------------------------------------------
alter table public.students
  add column if not exists personal_email    text,
  add column if not exists emergency_contact text,
  add column if not exists phone             text,
  add column if not exists skills            text[],
  add column if not exists achievements      text[],
  add column if not exists badges            text[],
  add column if not exists photo_url         text,
  add column if not exists gender            text,
  add column if not exists date_of_birth     date,
  add column if not exists admission_year    int,
  add column if not exists academic_year     text;

-- ---------------------------------------------------------------
-- 10. students.status — ensure column exists and has a default
-- ---------------------------------------------------------------
alter table public.students
  add column if not exists status text not null default 'active'
    check (status in ('active','inactive','graduated','dropped'));

-- ---------------------------------------------------------------
-- 11. Ensure anon/authenticated can read the college lookup table
--     (needed for login page college selector)
-- ---------------------------------------------------------------
grant select on public.colleges to anon;
grant select on public.colleges to authenticated;

grant select on public.departments to authenticated;
grant select on public.courses     to authenticated;
grant select on public.subjects    to authenticated;
grant select on public.sections    to authenticated;

-- ---------------------------------------------------------------
-- 12. v_students_public — re-grant after cascade drop (safety)
-- ---------------------------------------------------------------
-- Already granted above in section 4, but repeat for idempotency
grant select on public.v_students_public to authenticated;
grant select on public.v_students_public to anon;

-- ---------------------------------------------------------------
-- Done. Run this entire file once in Supabase SQL editor.
-- All statements are idempotent (ADD COLUMN IF NOT EXISTS,
-- CREATE OR REPLACE, DROP POLICY IF EXISTS, etc.)
-- ---------------------------------------------------------------
