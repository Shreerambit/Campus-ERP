/**
 * Canonical teacher-selected subject.
 *
 * One selected subject per teacher session, keyed by (auth.uid, college, semester)
 * so that logging out / logging in as a different teacher never leaks the
 * previous teacher's selection. Persisted in sessionStorage (cleared on
 * browser close / logout) with a localStorage fallback for page reloads.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth';
import { useScope } from './scope';
import { useSubjects, useMyTeacher } from './liveData';
import { HAS_SUPABASE, supabase } from './supabase';

export type SubjectSummary = {
  id: string;
  code: string;
  name: string;
  semester: number | null;
  /** Canonical short code — strips a known college prefix (e.g. "BVVS-") so that
   *  "BVVS-SE" and "SE" collapse to the same display. We keep the ID of the
   *  canonical record so the dedup is UI-only; DB rows are never merged. */
  shortCode: string;
};

type Ctx = {
  /** Subjects the teacher can legitimately pick (deduplicated, current semester). */
  availableSubjects: SubjectSummary[];
  /** The teacher's currently chosen subject (null if not yet picked). */
  selectedSubject: SubjectSummary | null;
  /** The teacher must choose before accessing Attendance/Notes when > 1 choice. */
  needsChoice: boolean;
  /** Explicitly pick (or change) the subject. */
  selectSubject: (id: string) => void;
  /** Clear on logout. */
  clear: () => void;
};

const SubjectCtx = createContext<Ctx | null>(null);

const STORAGE_BASE = 'campus.teacherSubject.v1';

function storageKey(uid: string, college: string, sem: number): string {
  return `${STORAGE_BASE}:${uid}:${college}:${sem}`;
}

/** College-code prefix that the seed uses. If the DB later uses other
 *  prefixes (e.g. "BVB-"), they can be added here — the UI will still dedupe.
 *  We do NOT assume every subject starts with "BVVS-"; we only strip it when
 *  the rest is an alphanumeric subject code (not e.g. "BVVS-ENGLISH"). */
const KNOWN_PREFIXES = ['BVVS-'];

function canonicalShortCode(rawCode: string | null | undefined): string {
  if (!rawCode) return '';
  const c = rawCode.trim().toUpperCase();
  for (const p of KNOWN_PREFIXES) {
    if (c.startsWith(p)) {
      const tail = c.slice(p.length);
      // Treat short codes (1-6 letters/numbers) as canonical; long names keep prefix.
      if (tail.length >= 1 && tail.length <= 6 && /^[A-Z0-9]+$/.test(tail)) return tail;
    }
  }
  return c;
}

/**
 * Dedupe a list of subjects by canonical shortCode. When two rows map to the
 * same short code (e.g. "BVVS-SE" and "SE"), we prefer the one with the
 * college-prefixed code because that is the row all recent migrations write
 * to. If neither is prefixed we keep the first (sorted by code ascending).
 *
 * No DB writes — purely a view-level normalization.
 */
export function dedupeSubjects(list: { id: string; code: string; name: string; semester: number | null }[]): SubjectSummary[] {
  const byShort = new Map<string, SubjectSummary>();
  for (const s of list) {
    const short = canonicalShortCode(s.code);
    const key = short || s.id;
    const candidate: SubjectSummary = {
      id: s.id, code: s.code, name: s.name, semester: s.semester, shortCode: short
    };
    const existing = byShort.get(key);
    if (!existing) { byShort.set(key, candidate); continue; }
    // Prefer the prefixed code (canonical record)
    const existingHasPrefix = KNOWN_PREFIXES.some(p => existing.code.toUpperCase().startsWith(p));
    const candidateHasPrefix = KNOWN_PREFIXES.some(p => candidate.code.toUpperCase().startsWith(p));
    if (candidateHasPrefix && !existingHasPrefix) byShort.set(key, candidate);
  }
  return Array.from(byShort.values()).sort((a, b) => a.shortCode.localeCompare(b.shortCode));
}

export function TeacherSubjectProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const scope = useScope();
  const collegeId = user?.college_id;
  const isTeacher = user?.role === 'teacher';

  const { data: allSubjects = [] } = useSubjects(collegeId);
  const { data: myTeacher } = useMyTeacher(collegeId, user?.id);

  // Subjects for the currently-scoped semester, deduplicated.
  const semSubjects = useMemo(
    () => allSubjects.filter(s => s.semester === scope.semester),
    [allSubjects, scope.semester]
  );
  const dedupedSem = useMemo(
    () => dedupeSubjects(semSubjects.map(s => ({ id: s.id, code: s.code, name: s.name, semester: s.semester }))),
    [semSubjects]
  );

  // Teachers only see subjects they are assigned to. Admins see all deduped
  // semester subjects (they don't use this provider gate, but the hook is
  // still safe to call).
  const teacherAllowedShortCodes = useMemo(() => {
    if (!isTeacher || !myTeacher?.assigned_subjects?.length) return null;
    const codes = new Set<string>();
    for (const c of myTeacher.assigned_subjects) {
      if (!c) continue;
      codes.add(canonicalShortCode(c));
    }
    return codes.size > 0 ? codes : null;
  }, [isTeacher, myTeacher]);

  // While the teacher record is still loading, show NO subjects so we never
  // flash the full list (which would let them pick a subject they aren't
  // assigned to, or trigger the wrong auto-select).
  const availableSubjects = useMemo(() => {
    if (!isTeacher) return dedupedSem;
    // Teacher path: wait until myTeacher resolves.
    if (myTeacher === undefined) return [];
    if (!teacherAllowedShortCodes) return dedupedSem; // no assignments listed → show all
    return dedupedSem.filter(s => teacherAllowedShortCodes.has(s.shortCode));
  }, [isTeacher, myTeacher, teacherAllowedShortCodes, dedupedSem]);

  const [authUid, setAuthUid] = useState<string | null>(null);
  useEffect(() => {
    if (!HAS_SUPABASE || !supabase) { setAuthUid(null); return; }
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setAuthUid(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
      if (cancelled) return;
      setAuthUid(session?.user?.id ?? null);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const storageId = authUid && collegeId && scope.semester
    ? storageKey(authUid, collegeId, scope.semester)
    : null;

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (!storageId) return null;
    try { return sessionStorage.getItem(storageId) || localStorage.getItem(storageId) || null; }
    catch { return null; }
  });

  // When semester changes or teacher changes, reset if stored id not in new list.
  useEffect(() => {
    if (!selectedId) return;
    if (!availableSubjects.find(s => s.id === selectedId)) {
      // DO NOT auto-pick subjects[0]. Leave null so the teacher is forced to choose.
      setSelectedId(null);
    }
  }, [availableSubjects, selectedId]);

  const persist = useCallback((id: string | null) => {
    if (!storageId) return;
    try {
      if (id) {
        sessionStorage.setItem(storageId, id);
        localStorage.setItem(storageId, id);
      } else {
        sessionStorage.removeItem(storageId);
        localStorage.removeItem(storageId);
      }
    } catch { /* ignore */ }
  }, [storageId]);

  const selectSubject = useCallback((id: string) => {
    if (!availableSubjects.find(s => s.id === id)) return;
    setSelectedId(id);
    persist(id);
  }, [availableSubjects, persist]);

  const clear = useCallback(() => {
    // Clear all teacher-subject keys for safety on logout
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(STORAGE_BASE)) sessionStorage.removeItem(k);
      }
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(STORAGE_BASE)) localStorage.removeItem(k);
      }
    } catch { /* ignore */ }
    setSelectedId(null);
  }, []);

  // If only ONE valid subject exists, auto-select (no ambiguity).
  // If 0 or >=2, do NOT auto-select anything.
  useEffect(() => {
    if (!isTeacher) return;
    if (selectedId) return;
    if (availableSubjects.length === 1) {
      selectSubject(availableSubjects[0].id);
    }
  }, [isTeacher, availableSubjects, selectedId, selectSubject]);

  const selectedSubject = useMemo(
    () => availableSubjects.find(s => s.id === selectedId) || null,
    [availableSubjects, selectedId]
  );

  // Teacher MUST choose when there are 2+ subjects and none chosen.
  // If exactly 1 is available we auto-select (no ambiguity).
  // If 0 are available we DON'T block the app — the gate simply stays out of
  // the way so pages can show their own "no subjects" messages.
  const needsChoice = isTeacher && availableSubjects.length >= 2 && !selectedSubject;

  const value: Ctx = useMemo(() => ({
    availableSubjects, selectedSubject, needsChoice, selectSubject, clear
  }), [availableSubjects, selectedSubject, needsChoice, selectSubject, clear]);

  return <SubjectCtx.Provider value={value}>{children}</SubjectCtx.Provider>;
}

export function useTeacherSubject(): Ctx {
  const c = useContext(SubjectCtx);
  if (!c) throw new Error('useTeacherSubject must be used inside TeacherSubjectProvider');
  return c;
}
