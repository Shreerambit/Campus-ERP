import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Search, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useCollegeStudentsWithAttendance, useTeachers } from '../lib/liveData';

export default function Directory() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [section, setSection] = useState('All');
  const [semester, setSemester] = useState<string>('All');
  const [dept, setDept] = useState<string>('All');
  const [tab, setTab] = useState<'students' | 'faculty'>('students');

  const collegeId = user?.college_id;
  const { data: all = [], isLoading, isError, error, refetch, isFetching } = useCollegeStudentsWithAttendance(collegeId);
  const { data: teachers = [], isLoading: teachersLoading } = useTeachers(collegeId);
  const sections   = useMemo(() => Array.from(new Set(all.map(s => s.section).filter(Boolean))).sort(), [all]);
  const semesters  = useMemo(() => Array.from(new Set(all.map(s => String(s.semester_number)))).sort(), [all]);
  const departments= useMemo(() => Array.from(new Set(all.map(s => s.department))).sort(), [all]);

  // Overall CGPA ranks — computed live from the same roster so
  // Directory + Rankings + StudentProfile always show identical numbers.
  const overallRank = useMemo(() => {
    const sorted = [...all].sort((a, b) => (b.cgpa - a.cgpa));
    const map = new Map<string, number>();
    sorted.forEach((s, i) => map.set(s.id, i + 1));
    return map;
  }, [all]);

  const rows = useMemo(() => {
    let arr = all;
    if (section !== 'All')  arr = arr.filter(s => s.section === section);
    if (semester !== 'All') arr = arr.filter(s => String(s.semester_number) === semester);
    if (dept !== 'All')     arr = arr.filter(s => s.department === dept);
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      arr = arr.filter(s =>
        s.name.toLowerCase().includes(t) ||
        s.reg_no.toLowerCase().includes(t) ||
        String(s.sl).includes(t)
      );
    }
    return arr.sort((a, b) => a.sl - b.sl);
  }, [q, section, semester, dept, all]);

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <div className="card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-10 w-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-ios-blue to-ios-indigo shrink-0">
            <Users size={18}/>
          </div>
          <div className="flex-1 min-w-[160px] no-x">
            <div className="h-section">Directory</div>
            <div className="h-title clip-1">{all.length} students · {teachers.length} faculty</div>
          </div>
          <button onClick={() => refetch()} className="chip" title="Refresh">
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''}/> Refresh
          </button>
        </div>

        {/* Students / Faculty tabs */}
        <div className="mt-3 inline-flex rounded-full border border-white/60 dark:border-white/10 bg-white/70 dark:bg-white/5 p-1">
          {(['students','faculty'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-xs sm:text-sm font-semibold transition
                ${tab === t ? 'text-white shadow-hi bg-gradient-to-br from-ios-blue to-ios-indigo' : 'opacity-70'}`}>
              {t === 'students' ? 'Students' : 'Faculty'}
            </button>
          ))}
        </div>

        {tab === 'students' && <div className="mt-3 flex flex-wrap gap-2">
          <select value={dept} onChange={e => setDept(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 text-sm">
            <option value="All">All departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={semester} onChange={e => setSemester(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 text-sm">
            <option value="All">All semesters</option>
            {semesters.map(s => <option key={s} value={s}>Sem {['I','II','III','IV','V','VI'][Number(s)-1] || s}</option>)}
          </select>
          <select value={section} onChange={e => setSection(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 text-sm">
            <option value="All">All sections</option>
            {sections.map(s => <option key={s} value={s}>Section {s}</option>)}
          </select>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 flex-1 min-w-[180px]">
            <Search size={14} className="opacity-60"/>
            <input placeholder="Search name, reg no, roll no…" value={q} onChange={e => setQ(e.target.value)}
              className="bg-transparent outline-none text-sm w-full"/>
          </div>
        </div>}
      </div>

      {tab === 'students' && (<>
      {isLoading && <div className="card flex items-center gap-2"><Loader2 className="animate-spin"/> Loading students…</div>}
      {isError && <div className="card border-ios-red/30 bg-ios-red/10 text-ios-red text-sm"><AlertCircle size={14} className="inline mr-1"/> {String((error as any)?.message || error)} <button onClick={() => refetch()} className="chip ml-2">Retry</button></div>}
      {!isLoading && !isError && rows.length === 0 && (
        <div className="card text-center py-8">
          <div className="h-title">No students found</div>
          <p className="text-sm opacity-70 mt-1">Try clearing the filters — or ask your admin to import the roster.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {rows.map((s, i) => (
          <motion.button
            key={s.id}
            onClick={() => nav(`/students/${s.reg_no}`)}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 20) * 0.02 }}
            whileHover={{ y: -2 }}
            className="text-left card !p-3 sm:!p-4 hover:shadow-hi transition min-w-0"
          >
            <div className="flex items-center gap-3 min-w-0">
              <img src={s.photo} className="h-12 w-12 rounded-2xl border border-white/60 bg-white shrink-0 object-cover"/>
              <div className="min-w-0 flex-1">
                <div className="font-semibold clip-1">{s.name}</div>
                <div className="text-[11px] opacity-60 clip-1">{s.reg_no} · Roll {s.short_roll}</div>
                <div className="text-[11px] opacity-60 clip-1 mt-0.5">{s.course} · Sem {s.semester}</div>
              </div>
              <span className="chip shrink-0">Sec {s.section || '—'}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <MiniStat label="Attend" value={`${s.attendance_pct}%`}/>
              <MiniStat label="CGPA"   value={s.cgpa.toFixed(2)}/>
              <MiniStat label="Rank"   value={`#${overallRank.get(s.id) ?? '—'}`}/>
            </div>
          </motion.button>
        ))}
      </div>
      </>)}

      {tab === 'faculty' && (<>
      {teachersLoading && <div className="card flex items-center gap-2"><Loader2 className="animate-spin"/> Loading faculty…</div>}
      {!teachersLoading && teachers.length === 0 && (
        <div className="card text-center py-8">
          <div className="h-title">No faculty found</div>
          <p className="text-sm opacity-70 mt-1">Ask your admin to add teachers.</p>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {teachers.filter(t =>
          !q.trim() || t.name.toLowerCase().includes(q.trim().toLowerCase())
                    || (t.username || '').toLowerCase().includes(q.trim().toLowerCase())
        ).map(t => (
          <motion.div key={t.id}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="card !p-4 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              {t.photo_url ? (
                <img src={t.photo_url} className="h-12 w-12 rounded-2xl border border-white/60 bg-white shrink-0 object-cover"/>
              ) : (
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-ios-blue to-ios-indigo text-white grid place-items-center font-bold shrink-0">
                  {t.name?.[0] || '?'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-semibold clip-1">{t.name}</div>
                <div className="text-[11px] opacity-60 clip-1">{t.username || t.emp_id}</div>
              </div>
              <span className={`chip shrink-0 ${t.status === 'active' ? 'text-ios-green' : 'text-ios-orange'}`}>{t.status}</span>
            </div>
            {(t.assigned_subjects || t.assigned_sections) && (
              <div className="mt-3 flex flex-wrap gap-1">
                {(t.assigned_subjects || []).map(s => <span key={s} className="chip text-ios-blue">{s}</span>)}
                {(t.assigned_sections || []).map(s => <span key={s} className="chip">Sec {s}</span>)}
              </div>
            )}
          </motion.div>
        ))}
      </div>
      </>)}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/60 dark:bg-white/5 border border-white/60 dark:border-white/10 py-2 text-center">
      <div className="text-[10px] opacity-60 uppercase tracking-wider">{label}</div>
      <div className="font-semibold tabular-nums text-sm">{value}</div>
    </div>
  );
}

