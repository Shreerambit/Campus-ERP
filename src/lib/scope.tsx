/**
 * Global "who am I looking at right now" context.
 *
 * Every page (Timetable, Attendance, Directory, Leaderboard, Notices,
 * Academics) reads the current (courseId, semester, section) from here
 * instead of holding its own local state. That way:
 *
 *   • Students are locked to their own values.
 *   • Teachers/admins pick once and the choice persists across pages
 *     and page reloads (localStorage).
 *   • Nothing ever silently defaults to Sem VI.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth';
import { useTenant } from './tenant';

export type Scope = {
  courseId: string;
  semester: number;
  section: string;
};

type Ctx = Scope & {
  setCourse: (id: string) => void;
  setSemester: (n: number) => void;
  setSection: (s: string) => void;
  setScope: (patch: Partial<Scope>) => void;
  /** True when the current user is a student/parent — pages should
   *  hide the picker in that case. */
  locked: boolean;
};

const ScopeCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = 'campus.scope.v1';

function loadPersisted(): Partial<Scope> | null {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
  catch { return null; }
}
function persist(s: Scope) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { colleges } = useTenant();

  const college = user?.college_id ? colleges.find(c => c.id === user.college_id) : undefined;
  const firstCourse = college?.departments[0]?.courses[0];

  // Priority order for defaults:
  //   1. Student's own record (locked)
  //   2. localStorage (last teacher/admin pick)
  //   3. First course + latest semester + first section (fallback)
  const isStudent = user?.role === 'student' || user?.role === 'parent';
  const persisted = loadPersisted();

  const initial: Scope = useMemo(() => {
    if (isStudent && user?.student) {
      return {
        courseId: user.student.course_id,
        semester: user.student.semester_number,
        section:  user.student.section || 'A'
      };
    }
    if (persisted?.courseId && persisted.semester && persisted.section) {
      return persisted as Scope;
    }
    const latestSem = firstCourse?.semesters?.[firstCourse.semesters.length - 1];
    return {
      courseId: firstCourse?.id || '',
      semester: latestSem?.number || 5,
      section:  latestSem?.sections?.[0] || 'A'
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role, firstCourse?.id]);

  const [scope, setScopeState] = useState<Scope>(initial);

  // Whenever the initial changes (login/logout), snap to it.
  useEffect(() => { setScopeState(initial); }, [initial.courseId, initial.semester, initial.section]);

  // Re-sync students whenever their profile section changes in DB
  useEffect(() => {
    if (isStudent && user?.student?.section && user.student.section !== scope.section) {
      setScopeState(s => ({ ...s, section: user.student!.section }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.student?.section]);

  // Persist only teacher/admin choices (students are locked)
  useEffect(() => {
    if (!isStudent && scope.courseId) persist(scope);
  }, [scope, isStudent]);

  const value: Ctx = useMemo(() => ({
    ...scope,
    locked: isStudent,
    setCourse:   (id) => setScopeState(s => ({ ...s, courseId: id })),
    setSemester: (n)  => setScopeState(s => ({ ...s, semester: n })),
    setSection:  (x)  => setScopeState(s => ({ ...s, section: x })),
    setScope:    (p)  => setScopeState(s => ({ ...s, ...p }))
  }), [scope, isStudent]);

  return <ScopeCtx.Provider value={value}>{children}</ScopeCtx.Provider>;
}

export function useScope() {
  const ctx = useContext(ScopeCtx);
  if (!ctx) throw new Error('useScope must be used inside ScopeProvider');
  return ctx;
}
