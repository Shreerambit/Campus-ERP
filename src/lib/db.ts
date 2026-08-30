/**
 * Thin, typed wrappers around the Supabase REST API.
 * ---------------------------------------------------
 * All React Query hooks in the app call functions here, so if you ever
 * switch backends the swap only happens in one file.
 */
import { supabase, HAS_SUPABASE } from './supabase';

export type UUID = string;

export type DBCollege = {
  id: UUID; code: string; name: string; short_name: string | null;
  city: string | null; logo_letter: string | null;
  brand_gradient: string; status: 'active' | 'suspended';
};
export type DBDepartment = { id: UUID; college_id: UUID; code: string; name: string };
export type DBCourse     = { id: UUID; department_id: UUID; code: string; name: string };
export type DBSection    = { id: UUID; course_id: UUID; semester: number; section: string };
export type DBSubject    = { id: UUID; college_id: UUID; department_id: UUID | null; code: string; name: string; semester: number | null; credits: number };
export type DBMark       = {
  id: UUID; student_id: UUID; subject_id: UUID; college_id: UUID;
  kind: 'internal' | 'external' | 'lab' | 'practical' | 'project';
  score: number; max_score: number;
};
export type DBResult     = {
  id: UUID; student_id: UUID; college_id: UUID;
  semester: number; sgpa: number | null; cgpa: number | null;
};
export type DBStudent    = {
  id: UUID; auth_user_id: UUID | null;
  college_id: UUID; department_id: UUID; course_id: UUID;
  semester: number; section: string;
  reg_no: string; name: string; roll_number: number | null;
  dob: string | null; gender: string | null;
  photo_url: string | null; personal_email: string | null;
  phone: string | null; emergency_contact: string | null;
  admission_year: number | null; academic_year: string | null;
  cgpa: number | null; sgpa: number | null;
  skills: string[]; achievements: string[]; badges: string[];
  password_changed: boolean;
};
export type DBTeacher = {
  id: UUID; auth_user_id: UUID | null;
  college_id: UUID; department_id: UUID | null;
  emp_id: string; name: string; email: string | null;
};
export type DBProfile = {
  id: UUID; role: 'student' | 'teacher' | 'admin' | 'parent' | 'super';
  full_name: string | null; photo_url: string | null;
  college_id: UUID | null;
};

/* ---------- Helpers ---------- */
function ensureClient() {
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.');
  return supabase;
}

/* ---------- Colleges tree ---------- */
export async function fetchColleges(): Promise<DBCollege[]> {
  const sb = ensureClient();
  const { data, error } = await sb.from('colleges').select('*').eq('status', 'active').order('name');
  if (error) throw error;
  return data || [];
}
export async function fetchDepartments(collegeId: UUID): Promise<DBDepartment[]> {
  const sb = ensureClient();
  const { data, error } = await sb.from('departments').select('*').eq('college_id', collegeId).order('name');
  if (error) throw error;
  return data || [];
}
export async function fetchCourses(departmentId: UUID): Promise<DBCourse[]> {
  const sb = ensureClient();
  const { data, error } = await sb.from('courses').select('*').eq('department_id', departmentId).order('name');
  if (error) throw error;
  return data || [];
}
export async function fetchSections(courseId: UUID): Promise<DBSection[]> {
  const sb = ensureClient();
  const { data, error } = await sb.from('sections').select('*').eq('course_id', courseId).order('semester').order('section');
  if (error) throw error;
  return data || [];
}

/* ---------- Students ---------- */
export type FetchStudentsOpts = {
  collegeId?: UUID;
  courseId?: UUID;
  semester?: number;
  section?: string;
  search?: string;
  limit?: number;
};
export async function fetchStudents(opts: FetchStudentsOpts = {}): Promise<DBStudent[]> {
  const sb = ensureClient();
  let q = sb.from('students').select('*');
  if (opts.collegeId) q = q.eq('college_id', opts.collegeId);
  if (opts.courseId)  q = q.eq('course_id',  opts.courseId);
  if (opts.semester)  q = q.eq('semester',   opts.semester);
  if (opts.section)   q = q.eq('section',    opts.section);
  if (opts.search) {
    const s = opts.search.trim();
    q = q.or(`reg_no.ilike.%${s}%,name.ilike.%${s}%`);
  }
  q = q.order('roll_number').limit(opts.limit ?? 500);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchStudentByReg(collegeId: UUID, regNo: string): Promise<DBStudent | null> {
  const sb = ensureClient();
  const { data, error } = await sb.from('students')
    .select('*')
    .eq('college_id', collegeId)
    .ilike('reg_no', regNo)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchMyStudent(): Promise<DBStudent | null> {
  const sb = ensureClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await sb.from('students').select('*').eq('auth_user_id', u.user.id).maybeSingle();
  if (error) throw error;
  return data;
}

/** All subjects for the college (used by results / academics). */
export async function fetchSubjects(collegeId: UUID): Promise<DBSubject[]> {
  const sb = ensureClient();
  const { data, error } = await sb.from('subjects')
    .select('*').eq('college_id', collegeId).order('semester').order('code');
  if (error) throw error;
  return (data || []) as DBSubject[];
}

/** All marks for one student (both CIA and SEE). */
export async function fetchStudentMarks(studentId: UUID): Promise<DBMark[]> {
  const sb = ensureClient();
  const { data, error } = await sb.from('marks')
    .select('*').eq('student_id', studentId);
  if (error) throw error;
  return (data || []) as DBMark[];
}

/** All semester results for one student (SGPA/CGPA per sem). */
export async function fetchStudentResults(studentId: UUID): Promise<DBResult[]> {
  const sb = ensureClient();
  const { data, error } = await sb.from('results')
    .select('*').eq('student_id', studentId).order('semester');
  if (error) throw error;
  return (data || []) as DBResult[];
}

/** Ranking view — pulls minimal columns for leaderboard performance. */
export async function fetchCollegeRanking(collegeId: UUID): Promise<Pick<DBStudent, 'id' | 'reg_no' | 'name' | 'section' | 'roll_number' | 'cgpa' | 'sgpa' | 'photo_url'>[]> {
  const sb = ensureClient();
  const { data, error } = await sb.from('students')
    .select('id, reg_no, name, section, roll_number, cgpa, sgpa, photo_url')
    .eq('college_id', collegeId)
    .eq('status', 'active')
    .order('cgpa', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data || []) as any;
}

export async function upsertStudents(rows: Partial<DBStudent>[]): Promise<{ inserted: number }> {
  const sb = ensureClient();
  const { error, count } = await sb.from('students').upsert(rows, {
    onConflict: 'college_id,reg_no', ignoreDuplicates: false, count: 'exact'
  });
  if (error) throw error;
  return { inserted: count || rows.length };
}

/* ---------- Profile & session ---------- */
export async function fetchMyProfile(): Promise<DBProfile | null> {
  const sb = ensureClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('id', u.user.id).maybeSingle();
  if (error) throw error;
  return data;
}

/* ---------- Super Admin: college CRUD ---------- */
export async function createCollege(c: Partial<DBCollege>): Promise<DBCollege> {
  const sb = ensureClient();
  const { data, error } = await sb.from('colleges').insert(c).select().single();
  if (error) throw error;
  return data;
}
export async function updateCollege(id: UUID, patch: Partial<DBCollege>): Promise<void> {
  const sb = ensureClient();
  const { error } = await sb.from('colleges').update(patch).eq('id', id);
  if (error) throw error;
}
export async function deleteCollege(id: UUID): Promise<void> {
  const sb = ensureClient();
  const { error } = await sb.from('colleges').delete().eq('id', id);
  if (error) throw error;
}

export { HAS_SUPABASE };
