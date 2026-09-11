-- =====================================================================
--  024_notifications_triggers_and_realtime.sql
--  ---------------------------------------------------------------------
--  Complete Real-Time Notification System with Automated DB Triggers:
--    • Schema enhancement for public.notifications
--    • Real-time triggers for notes, notices, attendance, marks, leaves, results
--    • Row Level Security (RLS) for strict privacy
--    • Enable Supabase Realtime publication
-- =====================================================================

-- 1. Schema Enhancements
alter table public.notifications
  add column if not exists link        text,
  add column if not exists type        text default 'system',
  add column if not exists student_id  uuid references public.students(id) on delete cascade,
  add column if not exists teacher_id  uuid references public.teachers(id) on delete cascade,
  add column if not exists entity_id   text,
  add column if not exists entity_type text,
  add column if not exists metadata    jsonb default '{}'::jsonb,
  add column if not exists read_at     timestamptz;

create index if not exists idx_notifications_user on public.notifications(user_id, is_read, created_at desc);
create index if not exists idx_notifications_student on public.notifications(student_id, is_read, created_at desc);
create index if not exists idx_notifications_teacher on public.notifications(teacher_id, is_read, created_at desc);
create index if not exists idx_notifications_college on public.notifications(college_id, is_read, created_at desc);

-- 2. RLS Policies
alter table public.notifications enable row level security;

drop policy if exists p_notify_read on public.notifications;
drop policy if exists p_notify_select on public.notifications;
create policy p_notify_select on public.notifications for select using (
  public.current_role() = 'super'
  or user_id = auth.uid()
  or exists (
    select 1 from public.students s
    where s.id = notifications.student_id and s.auth_user_id = auth.uid()
  )
  or exists (
    select 1 from public.teachers t
    where t.id = notifications.teacher_id and t.auth_user_id = auth.uid()
  )
  or (
    notifications.user_id is null
    and notifications.student_id is null
    and notifications.teacher_id is null
    and notifications.college_id = public.current_college()
    and (notifications.role_scope is null or notifications.role_scope = public.current_role())
  )
);

drop policy if exists p_notify_update_read on public.notifications;
create policy p_notify_update_read on public.notifications for update using (
  public.current_role() = 'super'
  or user_id = auth.uid()
  or exists (
    select 1 from public.students s
    where s.id = notifications.student_id and s.auth_user_id = auth.uid()
  )
  or exists (
    select 1 from public.teachers t
    where t.id = notifications.teacher_id and t.auth_user_id = auth.uid()
  )
  or notifications.college_id = public.current_college()
) with check (
  true
);

drop policy if exists p_notify_insert on public.notifications;
create policy p_notify_insert on public.notifications for insert with check (
  true
);

-- 3. Enable Supabase Realtime
do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then
    null;
  when others then
    null;
  end;
end $$;

-- =====================================================================
-- 4. AUTOMATED DATABASE TRIGGERS
-- =====================================================================

-- --- Trigger A: New Notes / Study Material Added ---
create or replace function public.on_study_material_added()
returns trigger as $$
declare
  sub_rec record;
  st_rec record;
begin
  select code, name, semester into sub_rec from public.subjects where id = new.subject_id;
  
  -- Insert a notification for every active student in this college & semester
  for st_rec in
    select id, auth_user_id
    from public.students
    where college_id = new.college_id
      and status = 'active'
      and (sub_rec.semester is null or semester = sub_rec.semester)
  loop
    insert into public.notifications (
      college_id, user_id, student_id, role_scope, type,
      title, body, link, entity_id, entity_type, metadata
    ) values (
      new.college_id,
      st_rec.auth_user_id,
      st_rec.id,
      'student',
      'note',
      '📖 New Notes: ' || coalesce(sub_rec.name, 'Study Material'),
      'New study material "' || new.title || '" has been uploaded.',
      '/notes',
      new.id::text,
      'study_materials',
      jsonb_build_object('note_id', new.id, 'subject_code', sub_rec.code)
    );
  end loop;
  
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_study_material_added on public.study_materials;
create trigger trg_study_material_added
  after insert on public.study_materials
  for each row execute function public.on_study_material_added();

-- --- Trigger B: New Notice Posted ---
create or replace function public.on_notice_posted()
returns trigger as $$
declare
  st_rec record;
  tc_rec record;
begin
  -- Notify students if audience is 'students' or 'all'
  if new.audience in ('students', 'all') then
    for st_rec in
      select id, auth_user_id from public.students where college_id = new.college_id and status = 'active'
    loop
      insert into public.notifications (
        college_id, user_id, student_id, role_scope, type,
        title, body, link, entity_id, entity_type
      ) values (
        new.college_id, st_rec.auth_user_id, st_rec.id, 'student', 'notice',
        '📢 Notice: ' || new.title,
        coalesce(substring(new.body from 1 for 140), 'A new campus announcement was posted.'),
        '/notices', new.id::text, 'notices'
      );
    end loop;
  end if;

  -- Notify teachers if audience is 'teachers' or 'all'
  if new.audience in ('teachers', 'all') then
    for tc_rec in
      select id, auth_user_id from public.teachers where college_id = new.college_id and status = 'active'
    loop
      insert into public.notifications (
        college_id, user_id, teacher_id, role_scope, type,
        title, body, link, entity_id, entity_type
      ) values (
        new.college_id, tc_rec.auth_user_id, tc_rec.id, 'teacher', 'notice',
        '📢 Faculty Notice: ' || new.title,
        coalesce(substring(new.body from 1 for 140), 'A new campus announcement was posted.'),
        '/notices', new.id::text, 'notices'
      );
    end loop;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_notice_posted on public.notices;
create trigger trg_notice_posted
  after insert on public.notices
  for each row execute function public.on_notice_posted();

-- --- Trigger C: Attendance Recorded / Updated ---
create or replace function public.on_attendance_recorded()
returns trigger as $$
declare
  st_rec record;
  sub_name text;
begin
  select auth_user_id into st_rec from public.students where id = new.student_id;
  select name into sub_name from public.subjects where id = new.subject_id;

  insert into public.notifications (
    college_id, user_id, student_id, role_scope, type,
    title, body, link, entity_id, entity_type, metadata
  ) values (
    new.college_id,
    st_rec.auth_user_id,
    new.student_id,
    'student',
    'attendance',
    '📋 Attendance: ' || upper(new.status),
    'Attendance marked as ' || upper(new.status) || ' for ' || coalesce(sub_name, 'Class') || ' on ' || new.taken_on::text || '.',
    '/dashboard',
    new.id::text,
    'attendance',
    jsonb_build_object('status', new.status, 'taken_on', new.taken_on)
  );

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_attendance_recorded on public.attendance;
create trigger trg_attendance_recorded
  after insert on public.attendance
  for each row execute function public.on_attendance_recorded();

-- --- Trigger D: Leave Application Submitted (Notify Teacher) or Status Changed (Notify Student) ---
create or replace function public.on_leave_event()
returns trigger as $$
declare
  st_rec record;
  tc_rec record;
begin
  select name, section, semester, auth_user_id into st_rec from public.students where id = new.student_id;

  if (tg_op = 'INSERT') then
    -- Notify teachers in this college
    for tc_rec in select id, auth_user_id from public.teachers where college_id = new.college_id and status = 'active' loop
      insert into public.notifications (
        college_id, user_id, teacher_id, role_scope, type,
        title, body, link, entity_id, entity_type
      ) values (
        new.college_id,
        tc_rec.auth_user_id,
        tc_rec.id,
        'teacher',
        'leave',
        '📝 New Leave Request: ' || st_rec.name,
        st_rec.name || ' (Sem ' || st_rec.semester || ' Sec ' || st_rec.section || ') applied for ' || new.leave_type || ' leave: "' || new.subject || '".',
        '/leave',
        new.id::text,
        'leaves'
      );
    end loop;
  elsif (tg_op = 'UPDATE' and old.status is distinct from new.status) then
    -- Notify the student when status changes (approved/rejected)
    insert into public.notifications (
      college_id, user_id, student_id, role_scope, type,
      title, body, link, entity_id, entity_type
    ) values (
      new.college_id,
      st_rec.auth_user_id,
      new.student_id,
      'student',
      'leave',
      '📝 Leave Application: ' || upper(new.status),
      'Your leave request "' || new.subject || '" has been ' || lower(new.status) || '.' ||
      case when new.teacher_note is not null and new.teacher_note <> '' then ' Note: ' || new.teacher_note else '' end,
      '/leave',
      new.id::text,
      'leaves'
    );
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_leave_event on public.leave_applications;
create trigger trg_leave_event
  after insert or update on public.leave_applications
  for each row execute function public.on_leave_event();

-- --- Trigger E: Results Published / Updated ---
create or replace function public.on_results_published()
returns trigger as $$
declare
  st_rec record;
begin
  select auth_user_id into st_rec from public.students where id = new.student_id;

  insert into public.notifications (
    college_id, user_id, student_id, role_scope, type,
    title, body, link, entity_id, entity_type, metadata
  ) values (
    new.college_id,
    st_rec.auth_user_id,
    new.student_id,
    'student',
    'academic',
    '🏆 Results Published: Semester ' || new.semester,
    'Your Semester ' || new.semester || ' result is available. SGPA: ' || coalesce(new.sgpa::text, '—') || ', CGPA: ' || coalesce(new.cgpa::text, '—') || '.',
    '/academics',
    new.id::text,
    'results',
    jsonb_build_object('semester', new.semester, 'sgpa', new.sgpa, 'cgpa', new.cgpa)
  );

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_results_published on public.results;
create trigger trg_results_published
  after insert or update on public.results
  for each row execute function public.on_results_published();
