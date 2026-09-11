import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { HAS_SUPABASE, supabase } from './supabase';

/* =====================================================================
 *  Multi-tenant college registry — Supabase is the only source of truth.
 *  Everything (colleges, departments, courses, sections) is fetched from
 *  the database on mount. Nothing is seeded in code.
 * =================================================================== */

export type College = {
  id: string;
  code: string;
  name: string;
  short: string;
  logoText: string;
  gradient: string;
  city: string;
  status: 'active' | 'suspended';
  departments: Department[];
  createdAt: number;
};
export type Department = { id: string; code: string; name: string; courses: Course[] };
export type Course     = { id: string; code: string; name: string; semesters: Semester[] };
export type Semester   = { id: string; number: number; label: string; sections: string[] };

/* ---------- Helpers ---------- */
function buildSemesters(dbSections: any[], courseId: string): Semester[] {
  const bySem = new Map<number, string[]>();
  for (const s of dbSections.filter(x => x.course_id === courseId)) {
    if (!bySem.has(s.semester)) bySem.set(s.semester, []);
    bySem.get(s.semester)!.push(s.section);
  }
  return Array.from(bySem.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([num, sections]) => ({
      id: `sem-${num}`, number: num,
      label: ['I','II','III','IV','V','VI','VII','VIII'][num - 1] || String(num),
      sections: sections.sort()
    }));
}

/* ---------- Context ---------- */
type TenantCtx = {
  colleges: College[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addCollege: (c: Partial<College>) => Promise<void>;
  updateCollege: (id: string, patch: Partial<College>) => Promise<void>;
  deleteCollege: (id: string) => Promise<void>;
  findCollege: (id: string) => College | undefined;
};
const Ctx = createContext<TenantCtx | null>(null);

// Persist across sessions so the very first paint on repeat launches is
// instant, and so a slow-network first-launch of the PWA never blanks out.
const TENANT_CACHE_KEY = 'campus.tenant.v2';
function loadCachedTenant(): College[] {
  try {
    const raw = localStorage.getItem(TENANT_CACHE_KEY);
    return raw ? (JSON.parse(raw) as College[]) : [];
  } catch { return []; }
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  // Warm-start with the last-seen tenant so the first paint is instant.
  // The background load() below then refreshes it silently.
  const cached = loadCachedTenant();
  const [colleges, setColleges] = useState<College[]>(cached);
  const [loading, setLoading]   = useState<boolean>(HAS_SUPABASE && cached.length === 0);
  const [error, setError]       = useState<string | null>(null);

  const load = async () => {
    if (!HAS_SUPABASE || !supabase) { setColleges([]); setLoading(false); return; }
    // Only show the spinner if we have nothing to display yet
    if (colleges.length === 0) setLoading(true);
    setError(null);
    // Safety: never let the boot gate wait more than 6s on this.
    const safety = setTimeout(() => setLoading(false), 6000);
    try {
      const [{ data: cols, error: e1 }, { data: deps, error: e2 }, { data: crs, error: e3 }, { data: secs, error: e4 }] =
        await Promise.all([
          supabase.from('colleges').select('*').order('name'),
          supabase.from('departments').select('*'),
          supabase.from('courses').select('*'),
          supabase.from('sections').select('*')
        ]);
      if (e1) throw e1; if (e2) throw e2; if (e3) throw e3; if (e4) throw e4;

      const built: College[] = (cols || []).map(c => ({
        id: c.id, code: c.code, name: c.name,
        short: c.short_name || c.name,
        logoText: c.logo_letter || (c.code?.[0] ?? '?'),
        gradient: c.brand_gradient || 'from-ios-blue to-ios-indigo',
        city: c.city || '',
        status: c.status,
        createdAt: Date.parse(c.created_at || new Date().toISOString()),
        departments: (deps || []).filter(d => d.college_id === c.id).map(d => ({
          id: d.id, code: d.code, name: d.name,
          courses: (crs || []).filter(cs => cs.department_id === d.id).map(cs => ({
            id: cs.id, code: cs.code, name: cs.name,
            semesters: buildSemesters(secs || [], cs.id)
          }))
        }))
      }));
      setColleges(built);
      try { localStorage.setItem(TENANT_CACHE_KEY, JSON.stringify(built)); } catch {}
      // eslint-disable-next-line no-console
      console.info(`[tenant] loaded ${built.length} colleges`);
    } catch (e: any) {
      setError(e?.message || String(e));
      // eslint-disable-next-line no-console
      console.error('[tenant] load failed', e);
    } finally {
      clearTimeout(safety);
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const value = useMemo<TenantCtx>(() => ({
    colleges, loading, error,
    refetch: load,
    async addCollege(c) {
      if (!supabase) return;
      const { error } = await supabase.from('colleges').insert({
        code: c.code, name: c.name, short_name: c.short, logo_letter: c.logoText,
        brand_gradient: c.gradient, city: c.city, status: c.status ?? 'active'
      } as any);
      if (error) throw error;
      await load();
    },
    async updateCollege(id, patch) {
      if (!supabase) return;
      const payload: any = {};
      if (patch.code)     payload.code = patch.code;
      if (patch.name)     payload.name = patch.name;
      if (patch.short)    payload.short_name = patch.short;
      if (patch.logoText) payload.logo_letter = patch.logoText;
      if (patch.gradient) payload.brand_gradient = patch.gradient;
      if (patch.city !== undefined) payload.city = patch.city;
      if (patch.status)   payload.status = patch.status;
      const { error } = await supabase.from('colleges').update(payload).eq('id', id);
      if (error) throw error;
      await load();
    },
    async deleteCollege(id) {
      if (!supabase) return;
      const { error } = await supabase.from('colleges').delete().eq('id', id);
      if (error) throw error;
      await load();
    },
    findCollege(id) { return colleges.find(c => c.id === id); }
  }), [colleges, loading, error]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTenant() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTenant must be inside TenantProvider');
  return c;
}
