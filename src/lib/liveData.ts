/**
 * Live data hooks — Supabase is the ONLY source of truth.
 * No local JSON fallbacks. Every hook returns [] / null when Supabase is not
 * configured (with a warning in the console).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HAS_SUPABASE, supabase } from './supabase';
import { Student } from './students';
import type { DBMark, DBResult, DBStudent, DBSubject } from './db';
import {
  fetchStudents, fetchStudentByReg, fetchMyStudent, upsertStudents,
  fetchSubjects, fetchStudentMarks, fetchStudentResults
} from './db';

/* ============================================================
 *  Adapters — DB row → app Student
 * ========================================================== */
export function dbToStudent(db: DBStudent, index = 0): Student {
  return {
    id: `${db.college_id}:${db.reg_no}`,
    db_id: db.id,
    reg_no: db.reg_no,
    name: db.name,
    // Roll number is ALWAYS the last 3 characters of the USN/reg_no.
    // We ignore the DB `roll_number` column for display because it was
    // populated with legacy attendance-sheet serials that don't match.
    short_roll: String(db.reg_no || '').slice(-3),
    photo: db.photo_url || `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(db.reg_no)}&backgroundType=gradientLinear`,
    college_id: db.college_id,
    department_id: db.department_id,
    course_id: db.course_id,
    semester_number: db.semester,
    section: (db.section === 'A' || db.section === 'B') ? db.section : '',
    batch_no: '',
    department: 'Computer Science',
    course: 'BCA',
    semester: ['I','II','III','IV','V','VI'][db.semester - 1] || String(db.semester),
    admission_year: db.admission_year || 2024,
    academic_year: db.academic_year || '',
    dob: db.dob || '',
    gender: ((db.gender as any) === 'Female' ? 'Female' : 'Male') as 'Male' | 'Female',
    // `sl` is used only for sorting/order in some pages. We use the
    // numeric tail of the reg_no so it matches short_roll.
    sl: parseInt(String(db.reg_no || '').slice(-3), 10) || (index + 1),
    attendance_pct: 0,     // set by attendance-summary hook if needed
    classes_attended: 0,
    total_classes: 0,
    cgpa: Number(db.cgpa || 0),
    sgpa: Number(db.sgpa || 0),
    consecutive_absents: 0,
    overall_rank: 0, attendance_rank: 0, cgpa_rank: 0,
    personal_email: db.personal_email || '',
    phone: db.phone || '',
    emergency_contact: db.emergency_contact || '',
    skills: db.skills || [],
    achievements: db.achievements || [],
    badges: db.badges || []
  };
}

/* ============================================================
 *  Students
 * ========================================================== */
export function useCollegeStudents(collegeId?: string, filters: {
  section?: string; courseId?: string; semester?: number;
} = {}) {
  return useQuery({
    queryKey: ['students', collegeId, filters],
    enabled: !!collegeId && HAS_SUPABASE,
    staleTime: 30_000,
    queryFn: async (): Promise<Student[]> => {
      if (!collegeId || !HAS_SUPABASE) return [];
      const rows = await fetchStudents({
        collegeId, section: filters.section, courseId: filters.courseId, semester: filters.semester, limit: 2000
      });
      // eslint-disable-next-line no-console
      console.info(`[liveData] students(${collegeId})`, { filters, count: rows.length });
      return rows.map((r, i) => dbToStudent(r, i));
    }
  });
}

/**
 * Roster + REAL attendance % per student, pulled from the DB view
 * v_student_attendance in one query. Used by Directory + Rankings so
 * every page displays identical numbers.
 */
export function useCollegeStudentsWithAttendance(collegeId?: string) {
  return useQuery({
    queryKey: ['students-with-att', collegeId],
    enabled: !!collegeId && HAS_SUPABASE,
    staleTime: 30_000,
    queryFn: async (): Promise<Student[]> => {
      if (!collegeId || !HAS_SUPABASE || !supabase) return [];
      const [{ data: rows }, { data: att }] = await Promise.all([
        supabase.from('students').select('*').eq('college_id', collegeId).eq('status', 'active').order('roll_number').limit(2000),
        supabase.from('v_student_attendance').select('student_id, pct, present, total').eq('college_id', collegeId)
      ]);
      const attMap = new Map<string, { pct: number; present: number; total: number }>();
      for (const a of att || []) attMap.set(a.student_id as string, { pct: Number(a.pct), present: Number(a.present), total: Number(a.total) });
      const students = (rows || []).map((r, i) => {
        const s = dbToStudent(r as any, i);
        const a = attMap.get(s.db_id);
        if (a) {
          s.attendance_pct = a.pct;
          s.classes_attended = a.present;
          s.total_classes = a.total;
        }
        return s;
      });
      return students;
    }
  });
}

export function useMyStudent(regNo?: string, collegeId?: string) {
  return useQuery({
    queryKey: ['me:student', collegeId, regNo],
    staleTime: 60_000,
    enabled: !!collegeId && !!regNo && HAS_SUPABASE,
    queryFn: async (): Promise<Student | null> => {
      if (!HAS_SUPABASE) return null;
      const mine = await fetchMyStudent();
      if (mine) return dbToStudent(mine);
      const row = await fetchStudentByReg(collegeId!, regNo!);
      return row ? dbToStudent(row) : null;
    }
  });
}

/* ============================================================
 *  Admin: student CRUD
 * ========================================================== */
export function useAddStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<DBStudent>) => {
      if (!HAS_SUPABASE) throw new Error('Supabase is not configured.');
      return upsertStudents([payload]);
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['students', vars.college_id] })
  });
}

export function useUpdateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<DBStudent> }) => {
      if (!HAS_SUPABASE || !supabase) throw new Error('Supabase is not configured.');
      const { error } = await supabase.from('students').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['students'] })
  });
}

export function useDeleteStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!HAS_SUPABASE || !supabase) throw new Error('Supabase is not configured.');
      const { error } = await supabase.from('students').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['students'] })
  });
}

/* ============================================================
 *  Notices
 * ========================================================== */
export type Notice = {
  id: string;
  college_id: string;
  title: string;
  body: string;
  target_scope: 'college' | 'department' | 'course' | 'semester' | 'section';
  target_ref: string | null;
  expires_at: string | null;
  created_by: string | null;         // auth.uid() of author
  created_by_name: string | null;
  created_by_photo: string | null;
  created_at: string;
};

export function useNotices(collegeId?: string) {
  return useQuery({
    queryKey: ['notices', collegeId],
    enabled: !!collegeId && HAS_SUPABASE,
    staleTime: 20_000,
    queryFn: async (): Promise<Notice[]> => {
      if (!collegeId || !HAS_SUPABASE || !supabase) return [];
      const { data, error } = await supabase.from('notices')
        .select('*').eq('college_id', collegeId).order('created_at', { ascending: false }).limit(100);
      if (error && error.code !== 'PGRST116') throw error;
      // eslint-disable-next-line no-console
      console.info(`[liveData] notices(${collegeId})`, { count: (data || []).length });
      return (data || []) as any;
    }
  });
}

export function useCreateNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (n: Omit<Notice, 'id' | 'created_at' | 'created_by'>) => {
      if (!HAS_SUPABASE || !supabase) throw new Error('Supabase is not configured.');
      // Stamp `created_by` with the current auth user so RLS ownership works
      const { data: { user } } = await supabase.auth.getUser();
      const payload = { ...n, created_by: user?.id ?? null };
      const { error } = await supabase.from('notices').insert(payload as any);
      if (error) throw error;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['notices', vars.college_id] })
  });
}

/**
 * Delete a notice. RLS enforces that only the author (teacher) or
 * an admin/super can delete — see migration 015.
 */
export function useDeleteNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; college_id?: string }) => {
      if (!HAS_SUPABASE || !supabase) throw new Error('Supabase is not configured.');
      const { error } = await supabase.from('notices').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['notices', vars.college_id] })
  });
}

/* ============================================================
 *  Teachers (real DB, no fallback)
 * ========================================================== */
export type Teacher = {
  id: string;
  emp_id: string;
  username: string | null;
  name: string;
  email: string | null;
  photo_url: string | null;
  college_id: string;
  department_id: string | null;
  assigned_subjects: string[] | null;
  assigned_sections: string[] | null;
  assigned_semesters: number[] | null;
  status: 'active' | 'inactive' | 'archived';
};

export function useTeachers(collegeId?: string) {
  return useQuery({
    queryKey: ['teachers', collegeId],
    enabled: !!collegeId && HAS_SUPABASE,
    staleTime: 60_000,
    queryFn: async (): Promise<Teacher[]> => {
      if (!collegeId || !HAS_SUPABASE || !supabase) return [];
      const { data, error } = await supabase.from('teachers')
        .select('id, emp_id, username, name, email, photo_url, college_id, department_id, assigned_subjects, assigned_sections, assigned_semesters, status')
        .eq('college_id', collegeId)
        .order('name');
      if (error && error.code !== 'PGRST116') throw error;
      // eslint-disable-next-line no-console
      console.info(`[liveData] teachers(${collegeId})`, { count: (data || []).length });
      return (data || []) as any;
    }
  });
}

/* ============================================================
 *  Timetable — live from public.timetable joined with subjects+teachers
 * ========================================================== */
export type TTSlot = {
  id: string; day_of_week: number; start_time: string; end_time: string;
  room: string | null; slot_type: 'Lecture' | 'Lab' | 'Tutorial';
  subject_code: string | null; subject_name: string | null;
  teacher_name: string | null;
};

export function useTimetable(collegeId?: string, sectionId?: string) {
  return useQuery({
    queryKey: ['timetable', collegeId, sectionId],
    enabled: !!collegeId && !!sectionId && HAS_SUPABASE,
    staleTime: 60_000,
    queryFn: async (): Promise<TTSlot[]> => {
      if (!collegeId || !sectionId || !HAS_SUPABASE || !supabase) return [];
      const { data, error } = await supabase
        .from('timetable')
        .select('id, day_of_week, start_time, end_time, room, slot_type, subject:subject_id (code, name), teacher:teacher_id (name)')
        .eq('college_id', collegeId)
        .eq('section_id', sectionId)
        .order('day_of_week').order('start_time');
      if (error && error.code !== 'PGRST116') throw error;
      return (data || []).map((r: any) => ({
        id: r.id, day_of_week: r.day_of_week, start_time: r.start_time, end_time: r.end_time,
        room: r.room, slot_type: r.slot_type,
        subject_code: r.subject?.code || null, subject_name: r.subject?.name || null,
        teacher_name: r.teacher?.name || null
      }));
    }
  });
}

/** Find the DB `section_id` for the student's current (course, semester, section). */
export function useMySectionId(courseId?: string, semester?: number, section?: string) {
  return useQuery({
    queryKey: ['section-id', courseId, semester, section],
    enabled: !!courseId && !!semester && !!section && HAS_SUPABASE,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string | null> => {
      if (!supabase) return null;
      const { data, error } = await supabase.from('sections').select('id')
        .eq('course_id', courseId!).eq('semester', semester!).eq('section', section!)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data?.id || null;
    }
  });
}

/* ============================================================
 *  Academic data: subjects, marks, results
 * ========================================================== */
export function useSubjects(collegeId?: string) {
  return useQuery({
    queryKey: ['subjects', collegeId],
    enabled: !!collegeId && HAS_SUPABASE,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DBSubject[]> => {
      if (!collegeId || !HAS_SUPABASE) return [];
      return await fetchSubjects(collegeId);
    }
  });
}

export type StudentSubjectMark = {
  subject_id: string; code: string; name: string;
  semester: number; credits: number;
  cia: number | null; cia_max: number;
  see: number | null; see_max: number;
  total: number; max_total: number;
  percentage: number; grade: string;
};

function letterGrade(percent: number): string {
  if (percent >= 90) return 'O';
  if (percent >= 80) return 'A+';
  if (percent >= 70) return 'A';
  if (percent >= 60) return 'B+';
  if (percent >= 50) return 'B';
  if (percent >= 45) return 'C';
  if (percent >= 40) return 'P';
  return 'F';
}

export function useStudentAcademics(studentId?: string, collegeId?: string) {
  return useQuery({
    queryKey: ['academics', studentId],
    enabled: !!studentId && !!collegeId && HAS_SUPABASE,
    staleTime: 60_000,
    queryFn: async () => {
      if (!studentId || !collegeId || !HAS_SUPABASE) {
        return { subjects: [] as StudentSubjectMark[], results: [] as DBResult[] };
      }
      const [subjects, marks, results] = await Promise.all([
        fetchSubjects(collegeId),
        fetchStudentMarks(studentId),
        fetchStudentResults(studentId)
      ]);
      const marksBySubject = new Map<string, { cia?: DBMark; see?: DBMark }>();
      for (const m of marks) {
        const cur = marksBySubject.get(m.subject_id) || {};
        if (m.kind === 'internal') cur.cia = m;
        if (m.kind === 'external') cur.see = m;
        marksBySubject.set(m.subject_id, cur);
      }
      const items: StudentSubjectMark[] = subjects
        .filter(s => marksBySubject.has(s.id))
        .map(s => {
          const m = marksBySubject.get(s.id)!;
          const cia = m.cia?.score ?? null;
          const see = m.see?.score ?? null;
          const cia_max = m.cia?.max_score ?? 20;
          const see_max = m.see?.max_score ?? 80;
          const total = (cia ?? 0) + (see ?? 0);
          const max_total = cia_max + see_max;
          const pct = max_total ? (total / max_total) * 100 : 0;
          return {
            subject_id: s.id, code: s.code, name: s.name,
            semester: s.semester ?? 0, credits: s.credits,
            cia, cia_max, see, see_max, total, max_total,
            percentage: Math.round(pct * 10) / 10,
            grade: letterGrade(pct)
          };
        })
        .sort((a, b) => a.semester - b.semester || a.code.localeCompare(b.code));
      return { subjects: items, results };
    }
  });
}

/* ============================================================
 *  Attendance summary (per student, aggregated from public.attendance)
 * ========================================================== */
export function useStudentAttendance(studentId?: string) {
  return useQuery({
    queryKey: ['attendance:summary', studentId],
    enabled: !!studentId && HAS_SUPABASE,
    staleTime: 30_000,
    queryFn: async () => {
      if (!studentId || !supabase) return { total: 0, present: 0, absent: 0, leave: 0, pct: 0 };
      const { data, error } = await supabase.from('attendance').select('status').eq('student_id', studentId);
      if (error && error.code !== 'PGRST116') throw error;
      const total   = (data || []).length;
      const present = (data || []).filter(x => x.status === 'present').length;
      const absent  = (data || []).filter(x => x.status === 'absent').length;
      const leaveN  = (data || []).filter(x => x.status === 'leave').length;
      const pct = total ? Math.round(((present + leaveN) / total) * 100) : 0;
      return { total, present, absent, leave: leaveN, pct };
    }
  });
}

/**
 * Subject-wise attendance breakdown for one student.
 * Returns [{ subject_id, code, name, total, present, absent, pct }, ...]
 * plus a computed `overall` object. Every subject is calculated
 * independently — no cross-contamination.
 */
export type SubjectAttendance = {
  subject_id: string; code: string; name: string;
  total: number; present: number; absent: number; leave: number; pct: number;
};
export function useStudentAttendanceBySubject(studentId?: string, collegeId?: string) {
  return useQuery({
    queryKey: ['attendance:by-subject', studentId],
    enabled: !!studentId && HAS_SUPABASE,
    staleTime: 30_000,
    queryFn: async (): Promise<{ subjects: SubjectAttendance[]; overall: { total: number; present: number; absent: number; pct: number } }> => {
      if (!studentId || !supabase) return { subjects: [], overall: { total: 0, present: 0, absent: 0, pct: 0 } };
      const { data, error } = await supabase.from('attendance')
        .select('status, subject_id, taken_on, subject:subject_id(code, name)')
        .eq('student_id', studentId)
        .order('taken_on', { ascending: false });
      if (error && error.code !== 'PGRST116') throw error;

      const bySubject = new Map<string, SubjectAttendance>();
      let oTotal = 0, oPresent = 0, oAbsent = 0, oLeave = 0;
      for (const r of (data || []) as any[]) {
        const sid = r.subject_id as string;
        const cur = bySubject.get(sid) || {
          subject_id: sid,
          code: r.subject?.code || '—',
          name: r.subject?.name || 'Subject',
          total: 0, present: 0, absent: 0, leave: 0, pct: 0
        };
        cur.total++;
        if (r.status === 'present') cur.present++;
        else if (r.status === 'absent') cur.absent++;
        else if (r.status === 'leave') cur.leave++;
        bySubject.set(sid, cur);

        oTotal++;
        if (r.status === 'present') oPresent++;
        else if (r.status === 'absent') oAbsent++;
        else if (r.status === 'leave')  oLeave++;
      }
      const subjects = Array.from(bySubject.values())
        .map(s => ({ ...s, pct: s.total ? Math.round(((s.present + s.leave) / s.total) * 1000) / 10 : 0 }))
        .sort((a, b) => a.code.localeCompare(b.code));
      const overallPct = oTotal ? Math.round(((oPresent + oLeave) / oTotal) * 1000) / 10 : 0;
      return { subjects, overall: { total: oTotal, present: oPresent, absent: oAbsent, pct: overallPct } };
    }
  });
}

/**
 * Recent attendance history for one student in ONE subject.
 * Returns most recent → oldest, limited to `limit` entries.
 * Used by the teacher's attendance card to render the ball-by-ball
 * strip.
 */
export function useStudentSubjectHistory(studentId?: string, subjectId?: string, limit = 15) {
  return useQuery({
    queryKey: ['attendance:history', studentId, subjectId, limit],
    enabled: !!studentId && !!subjectId && HAS_SUPABASE,
    staleTime: 30_000,
    queryFn: async (): Promise<{ status: 'present'|'absent'|'late'|'leave'; taken_on: string }[]> => {
      if (!studentId || !subjectId || !supabase) return [];
      const { data, error } = await supabase.from('attendance')
        .select('status, taken_on')
        .eq('student_id', studentId)
        .eq('subject_id', subjectId)
        .order('taken_on', { ascending: false })
        .limit(limit);
      if (error && error.code !== 'PGRST116') throw error;
      return (data || []) as any;
    }
  });
}

/**
 * The current logged-in teacher's own row (used to know which subjects
 * they are allowed to take attendance for).
 */
/**
 * The current logged-in teacher's own row.
 * Resolves canonically: first by auth.uid() via the teacher.auth_user_id FK
 * (the true link), then falls back to username (for older manual seeds and
 * for when the page is loaded cold from a persisted session).
 */
export function useMyTeacher(collegeId?: string, username?: string) {
  return useQuery({
    queryKey: ['me:teacher', collegeId, username],
    enabled: !!collegeId && HAS_SUPABASE,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!collegeId || !supabase) return null;
      // Ask Supabase for the current auth uid (works for freshly-logged-in users)
      const { data: auth } = await supabase.auth.getUser().catch(() => ({ data: null as any }));
      const uid = auth?.user?.id;
      // 1) Canonical link: teachers.auth_user_id = auth.uid()
      if (uid) {
        const byUid = await supabase.from('teachers')
          .select('id, name, username, email, photo_url, assigned_subjects, assigned_sections, assigned_semesters, college_id, department_id, status')
          .eq('college_id', collegeId).eq('auth_user_id', uid).maybeSingle();
        if (byUid.data) return byUid.data as any;
        if (byUid.error && byUid.error.code !== 'PGRST116') throw byUid.error;
      }
      // 2) Fallback: lookup by username (requires a username to be passed in)
      if (username && !username.includes('@')) {
        const byUname = await supabase.from('teachers')
          .select('id, name, username, email, photo_url, assigned_subjects, assigned_sections, assigned_semesters, college_id, department_id, status')
          .eq('college_id', collegeId).ilike('username', username).maybeSingle();
        if (byUname.data) return byUname.data as any;
        if (byUname.error && byUname.error.code !== 'PGRST116') throw byUname.error;
      }
      return null;
    }
  });
}

/* ============================================================
 *  Leave — Supabase-only
 * ========================================================== */
export type LeaveApp = {
  id: string; college_id: string; student_id: string | null;
  subject: string; reason: string; leave_type: string;
  from_date: string; to_date: string; status: string;
  teacher_note: string | null; created_at: string;
};

export function useMyLeaves(studentId?: string) {
  return useQuery({
    queryKey: ['leaves:mine', studentId],
    enabled: !!studentId && HAS_SUPABASE,
    staleTime: 20_000,
    queryFn: async (): Promise<LeaveApp[]> => {
      if (!studentId || !supabase) return [];
      const { data, error } = await supabase.from('leave_applications')
        .select('*').eq('student_id', studentId).order('created_at', { ascending: false });
      if (error && error.code !== 'PGRST116') throw error;
      return (data || []) as any;
    }
  });
}

export function useCollegeLeaves(collegeId?: string) {
  return useQuery({
    queryKey: ['leaves:college', collegeId],
    enabled: !!collegeId && HAS_SUPABASE,
    staleTime: 20_000,
    queryFn: async (): Promise<LeaveApp[]> => {
      if (!collegeId || !supabase) return [];
      const { data, error } = await supabase.from('leave_applications')
        .select('*, student:student_id (id, name, reg_no, section, roll_number, department_id, course_id, semester)')
        .eq('college_id', collegeId).order('created_at', { ascending: false });
      if (error && error.code !== 'PGRST116') throw error;
      return (data || []) as any;
    }
  });
}

export function useCreateLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: Partial<LeaveApp> & { college_id: string; student_id: string }) => {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error } = await supabase.from('leave_applications').insert(a as any);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['leaves:mine', vars.student_id] });
      qc.invalidateQueries({ queryKey: ['leaves:college', vars.college_id] });
    }
  });
}

export function useDecideLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: 'approved' | 'rejected'; note?: string }) => {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error } = await supabase.from('leave_applications')
        .update({ status, teacher_note: note || null, approved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leaves:college'] })
  });
}

/* ============================================================
 *  Attendance write path
 * ========================================================== */
export async function saveAttendanceBatch(
  rows: { student_id: string; subject_id: string; college_id: string; taken_on: string; status: 'present'|'absent'|'late'|'leave' }[]
): Promise<{ inserted: number }> {
  if (!HAS_SUPABASE || !supabase) throw new Error('Supabase is not configured.');
  const { error, count } = await supabase.from('attendance')
    .upsert(rows, { onConflict: 'student_id,subject_id,taken_on', count: 'exact' });
  if (error) throw error;
  return { inserted: count || rows.length };
}

/* ============================================================
 *  Rankings — overall + per-section
 * ========================================================== */
export type Rank = { rank: number; total: number };

export function useStudentRanks(collegeId?: string, regNo?: string, section?: string) {
  return useQuery({
    queryKey: ['ranks', collegeId, regNo, section],
    enabled: !!collegeId && !!regNo && HAS_SUPABASE,
    staleTime: 30_000,
    queryFn: async (): Promise<{ overall: Rank; sectionRank: Rank; attendance: Rank }> => {
      if (!collegeId || !supabase) return { overall: { rank: 0, total: 0 }, sectionRank: { rank: 0, total: 0 }, attendance: { rank: 0, total: 0 } };
      // Fetch roster + attendance summary in parallel (uses views from mig 014)
      const [{ data: all }, { data: att }] = await Promise.all([
        supabase.from('students')
          .select('reg_no, cgpa, section')
          .eq('college_id', collegeId).eq('status', 'active'),
        supabase.from('v_student_attendance').select('reg_no, pct').eq('college_id', collegeId)
      ]);
      const arr = (all || []).map(x => ({ reg_no: x.reg_no, cgpa: Number(x.cgpa || 0), section: x.section }));
      arr.sort((a, b) => b.cgpa - a.cgpa);
      const overallIdx = arr.findIndex(x => x.reg_no === regNo);
      const inSec = arr.filter(x => x.section === section);
      const secIdx = inSec.findIndex(x => x.reg_no === regNo);

      const attByReg = (att || []).map((x: any) => ({ reg_no: x.reg_no, pct: Number(x.pct || 0) }));
      attByReg.sort((a, b) => b.pct - a.pct);
      const attIdx = attByReg.findIndex(x => x.reg_no === regNo);

      return {
        overall:     { rank: overallIdx + 1, total: arr.length },
        sectionRank: { rank: secIdx + 1,     total: inSec.length },
        attendance:  { rank: attIdx + 1,     total: attByReg.length }
      };
    }
  });
}

/* ============================================================
 *  Timetable upload
 * ========================================================== */
export type UploadedSlot = {
  semester: number;
  section: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subject_code: string;
  subject_name: string;
  teacher: string;      // username or emp_id
  room: string;
  slot_type: 'Lecture' | 'Lab' | 'Tutorial';
};

export async function uploadTimetable(collegeId: string, courseId: string, rows: UploadedSlot[], replace = true) {
  if (!HAS_SUPABASE || !supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('upload_timetable', {
    p_college_id: collegeId,
    p_course_id: courseId,
    p_replace: replace,
    p_rows: rows as any
  });
  if (error) throw error;
  return data as { inserted: number; skipped: number };
}

/* ============================================================
 *  Teacher notes / study materials (with PDF uploads)
 * ========================================================== */
export type Note = {
  id: string;
  college_id: string;
  subject_id: string;
  title: string;
  body: string | null;
  kind: 'pdf' | 'ppt' | 'doc' | 'video' | 'link' | 'note' | null;
  path_or_url: string | null;
  uploaded_by: string | null;
  created_at: string;
  subject?: { code: string; name: string; semester?: number };
  teacher?: { name: string };
};

export function useNotes(collegeId?: string, filters: { subjectId?: string; semester?: number } = {}) {
  return useQuery({
    queryKey: ['notes', collegeId, filters],
    enabled: !!collegeId && HAS_SUPABASE,
    staleTime: 20_000,
    queryFn: async (): Promise<Note[]> => {
      if (!collegeId || !supabase) return [];
      let q = supabase.from('study_materials')
        .select('*, subject:subject_id(code, name, semester), teacher:uploaded_by(name)')
        .eq('college_id', collegeId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (filters.subjectId) q = q.eq('subject_id', filters.subjectId);
      const { data, error } = await q;
      if (error && error.code !== 'PGRST116') throw error;
      let rows = (data || []) as any[];
      if (filters.semester) rows = rows.filter(r => r.subject?.semester === filters.semester);
      return rows as Note[];
    }
  });
}

export async function uploadNotePdf(collegeId: string, subjectCode: string, file: File): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const safeName = file.name.replace(/[^\w.-]+/g, '_');
  const path = `${collegeId}/${subjectCode || 'general'}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from('notes').upload(path, file, {
    upsert: false, contentType: file.type || 'application/pdf'
  });
  if (error) throw error;
  const { data } = supabase.storage.from('notes').getPublicUrl(path);
  return data.publicUrl;
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (n: {
      college_id: string; subject_id: string; title: string;
      body?: string | null; kind?: Note['kind']; path_or_url?: string | null;
    }) => {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error } = await supabase.from('study_materials').insert({
        college_id: n.college_id,
        subject_id: n.subject_id,
        title: n.title,
        body: n.body ?? null,
        kind: n.kind ?? (n.path_or_url ? 'pdf' : 'note'),
        path_or_url: n.path_or_url ?? null
      } as any);
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['notes', v.college_id] })
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; college_id?: string }) => {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error } = await supabase.from('study_materials').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['notes', v.college_id] })
  });
}

/* ============================================================
 *  Colleges (Super admin + login pickers)
 * ========================================================== */
export function useColleges() {
  return useQuery({
    queryKey: ['colleges'],
    enabled: HAS_SUPABASE,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      if (!supabase) return [];
      const { data, error } = await supabase.from('colleges').select('*').order('name');
      if (error) throw error;
      return data || [];
    }
  });
}

/* ============================================================
 *  Profile photo upload — Supabase Storage
 * ========================================================== */
export async function uploadStudentPhoto(file: File, collegeId: string, regNo: string): Promise<string> {
  if (!HAS_SUPABASE || !supabase) throw new Error('Supabase is not configured.');
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${collegeId}/${regNo}.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  await supabase.from('students').update({ photo_url: data.publicUrl }).eq('college_id', collegeId).eq('reg_no', regNo);
  return data.publicUrl;
}
