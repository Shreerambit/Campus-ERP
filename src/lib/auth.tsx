import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Student } from './students';
import { HAS_SUPABASE, supabase } from './supabase';
import { fetchMyProfile, fetchStudentByReg } from './db';
import { dbToStudent } from './liveData';

export type Role = 'student' | 'teacher' | 'admin' | 'parent' | 'super';

export type SessionUser = {
  role: Role;
  id: string;                     // reg_no (student), username (teacher), admin_id, super_id
  displayName: string;
  college_id?: string;
  student?: Student;
  passwordChanged?: boolean;
  photo?: string;
  email?: string;
  emergencyContact?: string;
};

type AuthState = {
  user: SessionUser | null;
  remember: boolean;
  loading: boolean;
  isRemote: boolean;
  loginStudent: (opts: { collegeId: string; regNo: string; dobISO: string; remember: boolean }) => Promise<{ ok: boolean; error?: string; firstLogin?: boolean }>;
  loginTeacher: (opts: { collegeId: string; empId: string; password: string; remember: boolean }) => Promise<{ ok: boolean; error?: string }>;
  loginAdmin:   (opts: { collegeId: string; adminId: string; password: string; remember: boolean }) => Promise<{ ok: boolean; error?: string }>;
  loginParent:  (opts: { collegeId: string; regNo: string; password: string; remember: boolean }) => Promise<{ ok: boolean; error?: string }>;
  loginSuper:   (id: string, password: string, remember: boolean) => Promise<{ ok: boolean; error?: string }>;
  changePassword: (current: string, next: string) => Promise<{ ok: boolean; error?: string }>;
  updateProfile: (patch: Partial<Pick<SessionUser, 'photo' | 'email' | 'emergencyContact'>>) => Promise<void>;
  setSection: (section: string) => void;
  logout: () => Promise<void>;
};

const STORAGE_KEY = 'campus.session.v3';
const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  });
  const [remember, setRemember] = useState<boolean>(() => !!localStorage.getItem(STORAGE_KEY));
  const [loading, setLoading]   = useState<boolean>(HAS_SUPABASE);

  const persist = (u: SessionUser | null, rem: boolean) => {
    setUser(u); setRemember(rem);
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    if (!u) return;
    (rem ? localStorage : sessionStorage).setItem(STORAGE_KEY, JSON.stringify(u));
  };

  useEffect(() => {
    if (!user) return;
    (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, JSON.stringify(user));
  }, [user, remember]);

  /* Rehydrate real Supabase session on mount.
   *
   * Bugfix: on first-ever app launch (PWA / cold service worker cache),
   * fetchMyProfile() can hang for many seconds because the network is
   * warming up. We do NOT block the boot loader on that fetch:
   *   1. Read the session (fast, cached in localStorage by supabase-js).
   *   2. Immediately release the loading flag so the UI can paint.
   *   3. Then rebuild the profile in the background.
   * Also enforce a 6-second safety timeout so a stuck network never
   * traps the splash forever.
   */
  useEffect(() => {
    if (!HAS_SUPABASE || !supabase) { setLoading(false); return; }
    let cancelled = false;
    const done = () => { if (!cancelled) setLoading(false); };
    const safety = setTimeout(done, 6000);

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        // Release the loader immediately after the session is known.
        clearTimeout(safety);
        done();
        // Rebuild profile in the background — no UI wait.
        if (data.session) rebuildFromSupabase().catch(() => {});
      } catch {
        clearTimeout(safety);
        done();
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_ev, session) => {
      if (session?.user) rebuildFromSupabase().catch(() => {});
      else setUser(null);
    });
    return () => { cancelled = true; clearTimeout(safety); sub.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function rebuildFromSupabase() {
    if (!supabase) return;
    const profile = await fetchMyProfile();
    if (!profile) return;

    let student: Student | undefined;
    let id: string = profile.full_name || 'user';
    let displayName: string = profile.full_name || 'User';
    let photo: string | undefined = profile.photo_url || undefined;
    let email: string | undefined;
    let emergencyContact: string | undefined;
    let passwordChanged = true;
    const college_id = profile.college_id ?? undefined;

    if (profile.role === 'student' && college_id) {
      const { data } = await supabase.from('students').select('*').eq('auth_user_id', profile.id).maybeSingle();
      if (data) {
        student = dbToStudent(data);
        id = student.reg_no;
        displayName = student.name;
        photo = student.photo || photo;
        email = student.personal_email || undefined;
        emergencyContact = student.emergency_contact || undefined;
        passwordChanged = data.password_changed;
      }
    } else if (profile.role === 'teacher' && college_id) {
      // Canonical teacher identity: join profiles → teachers by auth_user_id
      const { data: t } = await supabase.from('teachers')
        .select('id, username, name, photo_url, email, password_changed, status')
        .eq('auth_user_id', profile.id)
        .eq('college_id', college_id)
        .maybeSingle();
      if (t) {
        id = t.username || t.id;
        displayName = t.name || profile.full_name || 'Faculty';
        photo = t.photo_url || photo;
        email = t.email || undefined;
        passwordChanged = t.password_changed;
      } else {
        // Fallback: some rows may have been linked by username before auth_user_id was set.
        // Match by email suffix on the auth user.
        const { data: u } = await supabase.auth.getUser();
        const emailAddr = u.user?.email || '';
        const uname = emailAddr.split('@')[0];
        if (uname) {
          const { data: t2 } = await supabase.from('teachers')
            .select('id, username, name, photo_url, email, password_changed, status')
            .eq('college_id', college_id).ilike('username', uname).maybeSingle();
          if (t2) {
            id = t2.username || t2.id;
            displayName = t2.name || profile.full_name || 'Faculty';
            photo = t2.photo_url || photo;
            email = t2.email || undefined;
            passwordChanged = t2.password_changed;
          }
        }
      }
    } else if (profile.role === 'parent' && college_id) {
      // Parent identity: derive reg_no from email `parent-<regno>@<college>.parent.local`
      const { data: u } = await supabase.auth.getUser();
      const emailAddr = u.user?.email || '';
      const localPart = emailAddr.split('@')[0] || '';
      const regNo = localPart.replace(/^parent-/, '').toUpperCase();
      if (regNo) {
        const s = await fetchStudentByReg(college_id, regNo).catch(() => null);
        if (s) {
          student = dbToStudent(s);
          id = regNo;
          displayName = `Parent of ${s.name}`;
          photo = s.photo_url || photo;
        } else {
          id = regNo;
          displayName = 'Parent';
        }
      }
    } else if (profile.role === 'admin' && college_id) {
      const { data: u } = await supabase.auth.getUser();
      const emailAddr = u.user?.email || 'admin';
      id = emailAddr.split('@')[0].toUpperCase();
      displayName = `College Admin · ${id}`;
    } else if (profile.role === 'super') {
      const { data: u } = await supabase.auth.getUser();
      const emailAddr = u.user?.email || 'super';
      id = emailAddr.split('@')[0].toUpperCase();
      displayName = `Super Admin · ${id}`;
    }

    persist({
      role: profile.role,
      id,
      college_id,
      displayName,
      photo,
      email,
      emergencyContact,
      passwordChanged,
      student
    }, true);
  }

  /* ==========================================================
   *  STUDENT LOGIN — shadow email pattern from migration 009d
   * ========================================================== */
  const loginStudent: AuthState['loginStudent'] = async ({ collegeId, regNo, dobISO, remember: rem }) => {
    if (!HAS_SUPABASE || !supabase) return { ok: false, error: 'Supabase is not configured.' };
    const dbStudent = await fetchStudentByReg(collegeId, regNo).catch(() => null);
    if (!dbStudent) return { ok: false, error: 'Registration number not found in this college.' };
    const email = `${dbStudent.reg_no.toLowerCase()}@${collegeId}.student.local`;
    const { error } = await supabase.auth.signInWithPassword({ email, password: dobISO });
    if (error) return { ok: false, error: 'Incorrect password.' };

    persist({
      role: 'student',
      id: dbStudent.reg_no,
      college_id: collegeId,
      displayName: dbStudent.name,
      student: dbToStudent(dbStudent),
      passwordChanged: dbStudent.password_changed,
      photo: dbStudent.photo_url || undefined,
      email: dbStudent.personal_email || undefined,
      emergencyContact: dbStudent.emergency_contact || undefined
    }, rem);
    return { ok: true, firstLogin: !dbStudent.password_changed };
  };

  /* ==========================================================
   *  TEACHER LOGIN — username-based (shadow email)
   * ========================================================== */
  const loginTeacher: AuthState['loginTeacher'] = async ({ collegeId, empId, password, remember: rem }) => {
    if (!HAS_SUPABASE || !supabase) return { ok: false, error: 'Supabase is not configured.' };
    const username = empId.trim().toLowerCase().replace(/\s+/g, '');
    const email = username.includes('@') ? username : `${username}@${collegeId}.teacher.local`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: 'Incorrect username or password.' };

    const { data: row } = await supabase.from('teachers')
      .select('id, username, name, photo_url, password_changed, college_id, status')
      .eq('college_id', collegeId).ilike('username', username).maybeSingle();

    if (row?.status === 'inactive' || row?.status === 'archived') {
      await supabase.auth.signOut();
      return { ok: false, error: 'Your account has been deactivated by the admin.' };
    }

    persist({
      role: 'teacher',
      id: username,
      college_id: collegeId,
      displayName: row?.name || `Faculty · ${username}`,
      passwordChanged: row?.password_changed ?? true,
      photo: row?.photo_url || undefined
    }, rem);
    return { ok: true };
  };

  /* ==========================================================
   *  ADMIN LOGIN — email as-is
   * ========================================================== */
  const loginAdmin: AuthState['loginAdmin'] = async ({ collegeId, adminId, password, remember: rem }) => {
    if (!HAS_SUPABASE || !supabase) return { ok: false, error: 'Supabase is not configured.' };
    const email = adminId.includes('@') ? adminId : adminId.toLowerCase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: 'Incorrect password.' };

    persist({
      role: 'admin', id: adminId.toUpperCase(), college_id: collegeId,
      displayName: `College Admin · ${adminId}`, passwordChanged: true
    }, rem);
    return { ok: true };
  };

  /* ==========================================================
   *  PARENT LOGIN — parent-<reg>@<college>.parent.local
   * ========================================================== */
  const loginParent: AuthState['loginParent'] = async ({ collegeId, regNo, password, remember: rem }) => {
    if (!HAS_SUPABASE || !supabase) return { ok: false, error: 'Supabase is not configured.' };
    const email = `parent-${regNo.toLowerCase()}@${collegeId}.parent.local`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: 'Incorrect parent password.' };

    // Fetch linked student for display
    const s = await fetchStudentByReg(collegeId, regNo).catch(() => null);
    persist({
      role: 'parent',
      id: regNo,
      college_id: collegeId,
      displayName: s ? `Parent of ${s.name}` : 'Parent',
      student: s ? dbToStudent(s) : undefined,
      passwordChanged: true,
      photo: s?.photo_url || undefined
    }, rem);
    return { ok: true };
  };

  /* ==========================================================
   *  SUPER ADMIN LOGIN
   * ========================================================== */
  const loginSuper: AuthState['loginSuper'] = async (id, password, rem) => {
    if (!HAS_SUPABASE || !supabase) return { ok: false, error: 'Supabase is not configured.' };
    const email = id.includes('@') ? id : id.toLowerCase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: 'Incorrect password.' };

    persist({
      role: 'super', id: id.toUpperCase(),
      displayName: `Super Admin · ${id}`, passwordChanged: true
    }, rem);
    return { ok: true };
  };

  /* ==========================================================
   *  Password change (students + teachers)
   * ========================================================== */
  const changePassword: AuthState['changePassword'] = async (_current, next) => {
    if (next.length < 6) return { ok: false, error: 'New password must be at least 6 characters.' };
    if (!HAS_SUPABASE || !supabase) return { ok: false, error: 'Supabase is not configured.' };
    const { data: authData, error } = await supabase.auth.updateUser({ password: next });
    if (error) return { ok: false, error: error.message };

    // Flip the DB flag so the next login skips First-Login.
    // If the update silently no-ops (e.g. missing RLS policy) we STILL
    // mark the session as changed so the user isn't looped forever.
    const authUid = authData?.user?.id;
    if (user?.role === 'student' && user?.student) {
      const { error: e2 } = await supabase.from('students')
        .update({ password_changed: true })
        .eq('reg_no', user.student.reg_no)
        .eq('college_id', user.college_id!);
      if (e2) console.warn('[auth] student password_changed flag not persisted:', e2.message);
    } else if (user?.role === 'teacher' && user?.college_id) {
      // Prefer auth_user_id (works with the new self-update RLS policy).
      // Fall back to username filter for older seeded rows.
      let e2: any = null;
      if (authUid) {
        const r = await supabase.from('teachers')
          .update({ password_changed: true })
          .eq('auth_user_id', authUid);
        e2 = r.error;
      }
      if (e2 || !authUid) {
        const r = await supabase.from('teachers')
          .update({ password_changed: true })
          .eq('college_id', user.college_id)
          .ilike('username', user.id);
        if (r.error) console.warn('[auth] teacher password_changed flag not persisted:', r.error.message);
      }
    }
    persist({ ...user!, passwordChanged: true }, remember);
    return { ok: true };
  };

  const updateProfile: AuthState['updateProfile'] = async (patch) => {
    if (!user || !supabase) return;
    if (user.student) {
      await supabase.from('students').update({
        photo_url:         patch.photo ?? undefined,
        personal_email:    patch.email ?? undefined,
        emergency_contact: patch.emergencyContact ?? undefined
      }).eq('reg_no', user.student.reg_no).eq('college_id', user.college_id!);
    }
    persist({ ...user, ...patch }, remember);
  };

  const logout: AuthState['logout'] = async () => {
    if (HAS_SUPABASE && supabase) await supabase.auth.signOut();
    persist(null, false);
  };

  const setSection: AuthState['setSection'] = (section) => {
    if (!user?.student) return;
    const nextStudent = { ...user.student, section };
    persist({ ...user, student: nextStudent }, remember);
  };

  const value = useMemo<AuthState>(() => ({
    user, remember, loading, isRemote: HAS_SUPABASE,
    loginStudent, loginTeacher, loginAdmin, loginParent, loginSuper,
    changePassword, updateProfile, setSection, logout
  }), [user, remember, loading]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
