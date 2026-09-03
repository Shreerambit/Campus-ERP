// Build a compact academic snapshot JSON for the authenticated student.
// All queries are scoped to (college_id, student_id) so we never leak data.
//
// Returns a deterministic JSON-serializable object suitable for stuffing
// into an LLM system prompt as ground truth. Numbers come straight from
// Postgres — never invented.

import { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export interface AcademicSnapshot {
  student: {
    name: string;
    reg_no: string;
    roll: string;
    course: string;
    department: string;
    semester: number;
    section: string;
    admission_year: number | null;
    gender: string | null;
  };
  cgpa: number | null;
  current_sgpa: number | null;
  semesters: { semester: number; sgpa: number | null; cgpa: number | null }[];
  subjects: {
    id: string;
    code: string;
    name: string;
    semester: number | null;
    credits: number;
    internal: number | null;      // sum of internal kinds
    internal_max: number | null;
    external: number | null;
    external_max: number | null;
    total: number | null;
    total_max: number | null;
    percent: number | null;
    grade: string | null;
    attendance: { present: number; absent: number; leave: number; total: number; pct: number } | null;
    is_backlog: boolean;
  }[];
  overall_attendance: { present: number; absent: number; leave: number; total: number; pct: number } | null;
  backlogs: { code: string; name: string; semester: number | null; total: number | null; pct: number | null }[];
  weak_subjects: { code: string; name: string; pct: number; reason: string }[];
  strong_subjects: { code: string; name: string; pct: number }[];
  recent_notes: { id: string; title: string; subject_code: string | null; subject_name: string | null; created_at: string }[];
  today_timetable: { time: string; subject_code: string | null; subject_name: string | null; teacher: string | null; room: string | null; type: string | null }[];
}

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

export async function buildSnapshot(sb: SupabaseClient, studentId: string, collegeId: string): Promise<AcademicSnapshot> {
  // Student profile
  const { data: sRow } = await sb.from('students')
    .select('id, reg_no, name, semester, section, admission_year, gender, course_id, department_id')
    .eq('id', studentId).eq('college_id', collegeId).maybeSingle().throwOnError();

  // Course/department names
  const { data: courseRow } = await sb.from('courses').select('code').eq('id', (sRow as any)?.course_id).maybeSingle();
  const { data: deptRow } = await sb.from('departments').select('code').eq('id', (sRow as any)?.department_id).maybeSingle();

  // Subjects
  const { data: subjects = [] } = await sb.from('subjects')
    .select('id, code, name, semester, credits').eq('college_id', collegeId);

  // Marks (college_id filter matches RLS policy)
  const { data: marks = [] } = await sb.from('marks')
    .select('subject_id, kind, score, max_score')
    .eq('student_id', studentId).eq('college_id', collegeId);

  // Results
  const { data: results = [] } = await sb.from('results')
    .select('semester, sgpa, cgpa')
    .eq('student_id', studentId).eq('college_id', collegeId)
    .order('semester');

  // Attendance overall (v_student_attendance)
  const { data: aRow } = await sb.from('v_student_attendance')
    .select('present, total, pct').eq('student_id', studentId).maybeSingle();

  // Attendance per subject (attendance rows are RLS-protected but the
  // student can see their own; we don't add college_id here because RLS
  // already guarantees it, and some old attendance rows were inserted
  // without college_id. This mirrors what the app already does for
  // student cards on Attendance.tsx).
  const { data: attBySubj = [] } = await sb.from('attendance')
    .select('subject_id, status').eq('student_id', studentId);
  const attMap = new Map<string, { present: number; absent: number; leave: number; total: number }>();
  for (const a of attBySubj as any[]) {
    const cur = attMap.get(a.subject_id) || { present: 0, absent: 0, leave: 0, total: 0 };
    cur.total++;
    if (a.status === 'present') cur.present++;
    else if (a.status === 'absent') cur.absent++;
    else if (a.status === 'leave') cur.leave++;
    attMap.set(a.subject_id, cur);
  }

  // Build subject summaries
  const marksBySubj = new Map<string, { internal: number; internalMax: number; external: number; externalMax: number }>();
  for (const m of marks as any[]) {
    const cur = marksBySubj.get(m.subject_id) || { internal: 0, internalMax: 0, external: 0, externalMax: 0 };
    if (m.kind === 'internal' || m.kind === 'lab' || m.kind === 'practical' || m.kind === 'project') {
      cur.internal += Number(m.score || 0);
      cur.internalMax += Number(m.max_score || 0);
    } else if (m.kind === 'external') {
      cur.external += Number(m.score || 0);
      cur.externalMax += Number(m.max_score || 0);
    }
    marksBySubj.set(m.subject_id, cur);
  }

  const subjOut: AcademicSnapshot['subjects'] = [];
  for (const s of subjects as any[]) {
    const m = marksBySubj.get(s.id);
    const internal = m?.internal ?? null;
    const internal_max = m?.internalMax ?? null;
    const external = m?.external ?? null;
    const external_max = m?.externalMax ?? null;
    const total = (internal != null && external != null) ? internal + external : (internal != null ? internal : null);
    const total_max = (internal_max != null && external_max != null) ? internal_max + external_max : (internal_max != null ? internal_max : null);
    const percent = (total != null && total_max) ? Math.round((total / total_max) * 1000) / 10 : null;
    const a = attMap.get(s.id) || null;
    const attSummary = a ? { present: a.present, absent: a.absent, leave: a.leave, total: a.total, pct: Math.round(((a.present + a.leave) / Math.max(a.total, 1)) * 1000) / 10 } : null;
    const is_backlog = percent != null && percent < 40;
    subjOut.push({
      id: s.id, code: s.code, name: s.name, semester: s.semester, credits: s.credits,
      internal, internal_max, external, external_max, total, total_max, percent,
      grade: percent != null ? letterGrade(percent) : null,
      attendance: attSummary, is_backlog,
    });
  }

  // CGPA / SGPA — prefer results table, fall back to students row
  const sortedResults = (results as any[]).slice().sort((a, b) => a.semester - b.semester);
  let cgpa: number | null = null;
  if (sortedResults.length) {
    const completed = sortedResults.filter(r => r.sgpa != null);
    if (completed.length) cgpa = +(completed.reduce((a, r) => a + Number(r.sgpa), 0) / completed.length).toFixed(2);
  }
  const current_sem = (sRow as any)?.semester ?? null;
  const currentRes = sortedResults.find(r => r.semester === current_sem);
  const current_sgpa = currentRes?.sgpa ?? (sRow as any)?.sgpa ?? null;
  if (cgpa == null) cgpa = (sRow as any)?.cgpa ?? null;

  // Backlogs: backlog if percent F (<40) OR external is present and < passing.
  // Simple rule: percent <40 OR recorded marks exist but external <28 (35% of 80).
  const backlogs = subjOut.filter(s => s.is_backlog).map(s => ({ code: s.code, name: s.name, semester: s.semester, total: s.total, pct: s.percent }));

  // Weak: percent 40–55; Strong: percent >=75. Only among subjects with marks.
  const graded = subjOut.filter(s => s.percent != null);
  const weak_subjects = graded.filter(s => s.percent! >= 40 && s.percent! < 55).map(s => {
    let reason = `Scored ${s.percent}%`;
    if (s.attendance && s.attendance.pct < 75) reason += `; attendance low (${s.attendance.pct}%)`;
    if (s.external != null && s.external_max && s.external / s.external_max < 0.35) reason += '; external exam is the main drag';
    else if (s.internal != null && s.internal_max && s.internal / s.internal_max < 0.5) reason += '; internals need work';
    return { code: s.code, name: s.name, pct: s.percent!, reason };
  });
  const strong_subjects = graded.filter(s => s.percent! >= 75).map(s => ({ code: s.code, name: s.name, pct: s.percent! }));

  // Recent notes for student's college, subjects in any semester they've taken
  const subjIds = subjOut.map(s => s.id);
  const { data: notes = [] } = await sb.from('study_materials')
    .select('id, title, created_at, subject:subject_id(code, name)')
    .eq('college_id', collegeId)
    .in('subject_id', subjIds.length ? subjIds : ['00000000-0000-0000-0000-000000000000'])
    .order('created_at', { ascending: false })
    .limit(10);
  const recent_notes = (notes as any[]).map(n => ({
    id: n.id, title: n.title, created_at: n.created_at,
    subject_code: n.subject?.code ?? null, subject_name: n.subject?.name ?? null,
  }));

  // Today's timetable
  const dow = new Date().getDay(); // 0=Sun..6=Sat
  // Resolve section id
  const { data: sec } = await sb.from('sections')
    .select('id').eq('course_id', (sRow as any)?.course_id).eq('semester', current_sem).eq('section', (sRow as any)?.section).maybeSingle();
  let today_timetable: AcademicSnapshot['today_timetable'] = [];
  if (sec?.id) {
    const { data: tt = [] } = await sb.from('timetable')
      .select('start_time, end_time, room, slot_type, subject:subject_id(code, name), teacher:teacher_id(name)')
      .eq('college_id', collegeId).eq('section_id', sec.id).eq('day_of_week', dow === 0 ? 7 : dow)
      .order('start_time');
    today_timetable = (tt as any[]).map(s => ({
      time: `${s.start_time?.slice(0,5) ?? ''}–${s.end_time?.slice(0,5) ?? ''}`,
      subject_code: s.subject?.code ?? null, subject_name: s.subject?.name ?? null,
      teacher: s.teacher?.name ?? null, room: s.room ?? null, type: s.slot_type ?? null,
    }));
  }

  return {
    student: {
      name: (sRow as any)?.name ?? 'Student',
      reg_no: (sRow as any)?.reg_no ?? '',
      roll: String((sRow as any)?.reg_no ?? '').slice(-3),
      course: (courseRow as any)?.code ?? '',
      department: (deptRow as any)?.code ?? '',
      semester: current_sem ?? 0,
      section: (sRow as any)?.section ?? '',
      admission_year: (sRow as any)?.admission_year ?? null,
      gender: (sRow as any)?.gender ?? null,
    },
    cgpa,
    current_sgpa,
    semesters: sortedResults as any,
    subjects: subjOut,
    overall_attendance: aRow ? {
      present: Number((aRow as any).present ?? 0),
      absent: Math.max(0, Number((aRow as any).total ?? 0) - Number((aRow as any).present ?? 0)),
      leave: 0, // view doesn't split leave; approximate
      total: Number((aRow as any).total ?? 0),
      pct: Math.round(Number((aRow as any).pct ?? 0) * 10) / 10,
    } : null,
    backlogs,
    weak_subjects,
    strong_subjects,
    recent_notes,
    today_timetable,
  };
}

// --------- Deterministic CGPA target math ---------
// Given current CGPA over N completed semesters, work out the SGPA needed
// over the remaining K semesters to hit a target CGPA at graduation.
export function cgpaTargetPlan(cgpaNow: number | null, completedSems: number, remainingSems: number, target: number) {
  if (cgpaNow == null) return null;
  if (remainingSems <= 0) return { feasible: false, reason: 'No remaining semesters.' };
  const needed = (target * (completedSems + remainingSems) - cgpaNow * completedSems) / remainingSems;
  const feasible = needed <= 10 && needed >= 0;
  return {
    feasible,
    current_cgpa: cgpaNow,
    target,
    completed_semesters: completedSems,
    remaining_semesters: remainingSems,
    required_sgpa_per_sem: +needed.toFixed(2),
    max_possible: +((cgpaNow * completedSems + 10 * remainingSems) / (completedSems + remainingSems)).toFixed(2),
  };
}
