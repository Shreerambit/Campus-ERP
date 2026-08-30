/**
 * Student type + a few pure helpers.
 *
 * ⚠️ NO local data lives here anymore. Every consumer must fetch from
 * Supabase via the hooks in `liveData.ts`. This file is intentionally
 * data-free so nothing in the app can accidentally render seed data.
 */

export type Student = {
  id: string;                    // "<college_id>:<reg_no>" (stable client key)
  db_id: string;                 // real Supabase UUID
  reg_no: string;
  name: string;
  short_roll: string;
  photo: string;

  /* Tenant keys */
  college_id: string;
  department_id: string;
  course_id: string;
  semester_number: number;
  section: string;               // 'A' | 'B' — may be '' if not confirmed yet
  batch_no: string;

  /* Admin-managed */
  department: string;
  course: string;
  semester: string;
  admission_year: number;
  academic_year: string;
  dob: string;
  gender: 'Male' | 'Female';
  sl: number;

  /* Metrics — sourced from DB */
  attendance_pct: number;
  classes_attended: number;
  total_classes: number;
  cgpa: number;
  sgpa: number;
  consecutive_absents: number;
  overall_rank: number;
  attendance_rank: number;
  cgpa_rank: number;

  /* Private */
  personal_email: string;
  phone: string;
  emergency_contact: string;

  /* Public (arrays, may be empty) */
  skills: string[];
  achievements: string[];
  badges: string[];
};

/* -------- Pure helpers (no I/O) -------- */
// Emojis intentionally removed — the app is emoji-free by design.
export function motivationEmoji(_pct: number): string {
  return '';
}
export function motivationMessage(pct: number): string {
  if (pct >= 90) return 'Excellent — keep it up.';
  if (pct >= 85) return "Great attendance — you're in the top tier.";
  if (pct >= 80) return 'Solid. A little more push for excellence.';
  if (pct >= 75) return 'Safe zone. Try to reach 85%.';
  if (pct >= 65) return 'Warning — attendance is slipping.';
  return 'Critical — you must attend upcoming classes.';
}
export function classesNeededTo(target: number, attended: number, total: number): number {
  const t = target / 100;
  if (total === 0) return 0;
  const x = Math.ceil((t * total - attended) / (1 - t));
  return Math.max(0, x);
}
