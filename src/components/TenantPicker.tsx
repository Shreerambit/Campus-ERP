import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, GraduationCap, BookOpen, Layers, Users, ChevronDown, Search, Loader2 } from 'lucide-react';
import { useTenant, College, Department, Course, Semester } from '../lib/tenant';

export type TenantSelection = {
  college?: College;
  department?: Department;
  course?: Course;
  semester?: Semester;
  section?: string;
};

const STORE = 'bvvs.lastSelection.v1';
export function loadLastSelection(): TenantSelection {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; }
}
export function saveLastSelection(sel: TenantSelection) {
  localStorage.setItem(STORE, JSON.stringify({
    college: sel.college && { id: sel.college.id },
    department: sel.department && { id: sel.department.id },
    course: sel.course && { id: sel.course.id },
    semester: sel.semester && { number: sel.semester.number },
    section: sel.section
  }));
}

type Props = {
  value: TenantSelection;
  onChange: (v: TenantSelection) => void;
  showSection?: boolean;
  showSemester?: boolean;
  compact?: boolean;
};

/** Chained selects: College → Department → Course → Semester → Section */
export default function TenantPicker({ value, onChange, showSection = true, showSemester = true, compact = false }: Props) {
  const { colleges, loading, error, refetch } = useTenant();
  const activeColleges = colleges.filter(c => c.status === 'active');

  const departments = value.college?.departments ?? [];
  const courses     = value.department?.courses ?? [];
  const semesters   = value.course?.semesters ?? [];
  const sections    = value.semester?.sections ?? [];

  return (
    <div className={compact ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 gap-3'}>
      {/* Status banner while loading / on error */}
      {loading && (
        <div className="rounded-2xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 px-3 py-2 flex items-center gap-2 text-xs opacity-80">
          <Loader2 size={12} className="animate-spin text-ios-blue"/> Loading colleges from database…
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-ios-red/30 bg-ios-red/10 px-3 py-2 text-xs text-ios-red flex items-center gap-2">
          Could not load colleges. <button onClick={() => refetch()} className="underline">Retry</button>
        </div>
      )}
      {!loading && !error && activeColleges.length === 0 && (
        <div className="rounded-2xl border border-ios-orange/30 bg-ios-orange/10 px-3 py-2 text-xs text-ios-orange">
          No colleges are set up yet.
        </div>
      )}

      <PickerSelect
        icon={<Building2 size={14}/>}
        label="College"
        placeholder={loading ? 'Loading…' : activeColleges.length === 0 ? 'No colleges available' : 'Choose your college'}
        value={value.college?.id}
        options={activeColleges.map(c => ({ id: c.id, label: `${c.short}${c.city ? ' · ' + c.city : ''}`, badge: c.code }))}
        onChange={id => {
          const c = activeColleges.find(x => x.id === id);
          onChange({ college: c });
        }}
      />

      <PickerSelect
        icon={<GraduationCap size={14}/>}
        label="Department"
        placeholder={value.college ? 'Choose department' : 'Select college first'}
        disabled={!value.college}
        value={value.department?.id}
        options={departments.map(d => ({ id: d.id, label: d.name, badge: d.code }))}
        onChange={id => {
          const d = departments.find(x => x.id === id);
          onChange({ ...value, department: d, course: undefined, semester: undefined, section: undefined });
        }}
      />

      <PickerSelect
        icon={<BookOpen size={14}/>}
        label="Course"
        placeholder={value.department ? 'Choose course' : 'Select department first'}
        disabled={!value.department}
        value={value.course?.id}
        options={courses.map(c => ({ id: c.id, label: c.name, badge: c.code }))}
        onChange={id => {
          const c = courses.find(x => x.id === id);
          onChange({ ...value, course: c, semester: undefined, section: undefined });
        }}
      />

      {showSemester && (
        <PickerSelect
          icon={<Layers size={14}/>}
          label="Semester"
          placeholder={value.course ? 'Choose semester' : 'Select course first'}
          disabled={!value.course}
          value={value.semester?.id}
          options={semesters.map(s => ({ id: s.id, label: `Semester ${s.label}`, badge: `Sem ${s.number}` }))}
          onChange={id => {
            const s = semesters.find(x => x.id === id);
            onChange({ ...value, semester: s, section: undefined });
          }}
        />
      )}

      {showSection && (
        <PickerSelect
          icon={<Users size={14}/>}
          label="Section"
          placeholder={value.semester ? 'Choose section' : 'Select semester first'}
          disabled={!value.semester}
          value={value.section}
          options={sections.map(s => ({ id: s, label: `Section ${s}`, badge: s }))}
          onChange={id => onChange({ ...value, section: id })}
        />
      )}
    </div>
  );
}

/* ------- Individual select ------- */
function PickerSelect({
  icon, label, placeholder, value, options, onChange, disabled
}: {
  icon: React.ReactNode; label: string; placeholder: string;
  value?: string; options: { id: string; label: string; badge?: string }[];
  onChange: (id: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const filtered = useMemo(() =>
    q.trim() ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options,
    [q, options]
  );
  const current = options.find(o => o.id === value);

  return (
    <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
      <label className="text-[11px] uppercase tracking-wider font-semibold opacity-70 flex items-center gap-1.5">
        {icon} {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="mt-1 w-full flex items-center gap-2 rounded-2xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-white/5 px-3 sm:px-4 py-3 text-left"
      >
        <span className="flex-1 min-w-0 text-[14px] sm:text-[15px] truncate">
          {current ? current.label : <span className="opacity-60">{placeholder}</span>}
        </span>
        {current?.badge && <span className="chip !text-[10px]">{current.badge}</span>}
        <ChevronDown size={16} className={`transition ${open ? 'rotate-180' : ''}`}/>
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className="mt-2 rounded-2xl glass p-2 shadow-card max-h-64 overflow-y-auto"
        >
          {options.length > 6 && (
            <div className="sticky top-0 flex items-center gap-2 rounded-xl px-2 py-1.5 bg-white/80 dark:bg-white/10 mb-1">
              <Search size={12} className="opacity-60"/>
              <input value={q} onChange={e => setQ(e.target.value)}
                placeholder="Search…" className="bg-transparent outline-none text-sm w-full"/>
            </div>
          )}
          {filtered.length === 0 && <div className="p-3 text-sm opacity-60">No matches.</div>}
          {filtered.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => { onChange(o.id); setOpen(false); setQ(''); }}
              className={`w-full flex items-center gap-2 text-left px-3 py-2.5 rounded-xl text-sm hover:bg-white/70 dark:hover:bg-white/10 transition ${o.id === value ? 'bg-ios-blue/10 text-ios-blue' : ''}`}
            >
              <span className="flex-1 truncate">{o.label}</span>
              {o.badge && <span className="chip !text-[10px]">{o.badge}</span>}
            </button>
          ))}
        </motion.div>
      )}
    </div>
  );
}
