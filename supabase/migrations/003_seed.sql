-- =====================================================================
--  Seed data — colleges + BVVS structure
--  ---------------------------------------------------------------------
--  This does NOT create auth users (that's done from the app via
--  Supabase Admin API when the college admin imports students).
-- =====================================================================

-- Colleges
insert into public.colleges (id, code, name, short_name, city, logo_letter, brand_gradient) values
  ('11111111-1111-1111-1111-111111111111', 'BVVS', 'B.V.V.S Basaveshwar Science College, Bagalkote', 'Basaveshwar Science College', 'Bagalkote', 'B', 'from-ios-blue to-ios-indigo'),
  ('22222222-2222-2222-2222-222222222222', 'JSS',  'JSS College of Arts, Commerce & Science',        'JSS College',                'Mysuru',    'J', 'from-ios-purple to-ios-pink'),
  ('33333333-3333-3333-3333-333333333333', 'SDM',  'SDM College of Engineering & Technology',        'SDM College',                'Dharwad',   'S', 'from-ios-orange to-ios-red')
on conflict (code) do nothing;

-- Departments (BVVS)
insert into public.departments (id, college_id, code, name) values
  ('aaaaaaaa-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'CS',  'Computer Science'),
  ('aaaaaaaa-0001-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'COM', 'Commerce'),
  ('aaaaaaaa-0002-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'CS',  'Computer Science'),
  ('aaaaaaaa-0002-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'BA',  'Arts'),
  ('aaaaaaaa-0003-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'CSE', 'Computer Science & Engineering')
on conflict do nothing;

-- Courses
insert into public.courses (id, department_id, code, name) values
  ('bbbbbbbb-0001-0000-0000-000000000001', 'aaaaaaaa-0001-0000-0000-000000000001', 'BCA',  'Bachelor of Computer Applications'),
  ('bbbbbbbb-0001-0000-0000-000000000002', 'aaaaaaaa-0001-0000-0000-000000000001', 'BSc',  'Bachelor of Science'),
  ('bbbbbbbb-0001-0000-0000-000000000003', 'aaaaaaaa-0001-0000-0000-000000000002', 'BCom', 'Bachelor of Commerce'),
  ('bbbbbbbb-0002-0000-0000-000000000001', 'aaaaaaaa-0002-0000-0000-000000000001', 'BCA',  'Bachelor of Computer Applications'),
  ('bbbbbbbb-0002-0000-0000-000000000002', 'aaaaaaaa-0002-0000-0000-000000000002', 'BA',   'Bachelor of Arts'),
  ('bbbbbbbb-0003-0000-0000-000000000001', 'aaaaaaaa-0003-0000-0000-000000000001', 'BTech','B.Tech Computer Science')
on conflict do nothing;

-- Sections: 6 semesters × 2 sections (A/B) for each BCA/BSc/BCom
do $$
declare c record;
begin
  for c in select id from public.courses loop
    for sem in 1..6 loop
      insert into public.sections (course_id, semester, section)
      values (c.id, sem, 'A'), (c.id, sem, 'B')
      on conflict do nothing;
    end loop;
  end loop;
end $$;

-- Sample subjects for BVVS BCA V Sem (matches the timetable in the app)
insert into public.subjects (college_id, department_id, code, name, semester, credits) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0001-0000-0000-000000000001','BVVS-SE',  'Software Engineering',           5, 4),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0001-0000-0000-000000000001','BVVS-DA',  'Data Analytics',                 5, 4),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0001-0000-0000-000000000001','BVVS-MAD', 'Mobile Application Development', 5, 4),
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0001-0000-0000-000000000001','BVVS-IT',  'Internet Technology',            5, 4)
on conflict do nothing;
