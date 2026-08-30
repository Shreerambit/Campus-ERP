import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Search, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useCollegeStudentsWithAttendance } from '../lib/liveData';

type Sort = 'overall' | 'cgpa' | 'sgpa' | 'attendance';
const LABELS: Record<Sort, string> = {
  overall: 'Overall',
  cgpa: 'CGPA',
  sgpa: 'Latest SGPA',
  attendance: 'Attendance'
};

export default function Leaderboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [sort, setSort] = useState<Sort>('cgpa');
  const [section, setSection] = useState<string>('All');
  const [semester, setSemester] = useState<string>('All');
  const [q, setQ] = useState('');

  const collegeId = user?.college_id;
  const { data: all = [], isLoading, isError, error, refetch, isFetching } = useCollegeStudentsWithAttendance(collegeId);

  const sections   = useMemo(() => Array.from(new Set(all.map(s => s.section).filter(Boolean))).sort(), [all]);
  const semesters  = useMemo(() => Array.from(new Set(all.map(s => String(s.semester_number)))).sort(), [all]);

  const rows = useMemo(() => {
    let arr = [...all];
    if (section !== 'All') arr = arr.filter(s => s.section === section);
    if (semester !== 'All') arr = arr.filter(s => String(s.semester_number) === semester);
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      arr = arr.filter(s => s.name.toLowerCase().includes(t) || s.reg_no.toLowerCase().includes(t));
    }
    // STRICT per-tab sorting — each tab uses ONLY its own metric.
    // Ties are broken alphabetically by name so ordering is deterministic.
    const byName = (a: any, b: any) => a.name.localeCompare(b.name);
    if (sort === 'cgpa') {
      arr.sort((a, b) => (b.cgpa - a.cgpa) || byName(a, b));
    } else if (sort === 'sgpa') {
      arr.sort((a, b) => (b.sgpa - a.sgpa) || byName(a, b));
    } else if (sort === 'attendance') {
      arr.sort((a, b) => (b.attendance_pct - a.attendance_pct) || byName(a, b));
    } else {
      // Overall = normalized 60% CGPA + 40% Attendance (both to 0-100).
      const score = (s: any) => (Number(s.cgpa) * 10 * 0.6) + (Number(s.attendance_pct) * 0.4);
      arr.sort((a, b) => (score(b) - score(a)) || byName(a, b));
    }
    return arr;
  }, [sort, section, semester, q, all]);

  return (
    <div className="space-y-6 min-w-0">
      <div className="card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-10 w-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-ios-orange to-ios-red shrink-0">
            <Trophy size={18}/>
          </div>
          <div className="flex-1 min-w-[160px] no-x">
            <div className="h-section">Rankings</div>
            <div className="h-title clip-1">
              {rows.length} students · sorted by {LABELS[sort]}
            </div>
          </div>
          <button onClick={() => refetch()} className="chip"><RefreshCw size={12} className={isFetching ? 'animate-spin' : ''}/> Refresh</button>
        </div>

        {/* Controls */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-white/60 dark:border-white/10 bg-white/70 dark:bg-white/5 p-1">
            {(['overall', 'cgpa', 'sgpa', 'attendance'] as Sort[]).map(k => (
              <button key={k} onClick={() => setSort(k)}
                className={`rounded-full px-3 py-1.5 text-xs sm:text-sm font-semibold transition
                ${sort === k ? 'text-white shadow-hi bg-gradient-to-br from-ios-blue to-ios-indigo' : 'opacity-70'}`}>{LABELS[k]}</button>
            ))}
          </div>
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
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 flex-1 min-w-[160px]">
            <Search size={14} className="opacity-60"/>
            <input placeholder="Search name or reg no…" value={q} onChange={e => setQ(e.target.value)}
              className="bg-transparent outline-none text-sm w-full"/>
          </div>
        </div>
      </div>

      {isLoading && <div className="card flex items-center gap-2"><Loader2 className="animate-spin"/> Loading leaderboard…</div>}
      {isError && <div className="card border-ios-red/30 bg-ios-red/10 text-ios-red text-sm">
        <AlertCircle size={14} className="inline mr-1"/> {String((error as any)?.message || error)}
        <button onClick={() => refetch()} className="chip ml-2">Retry</button>
      </div>}
      {!isLoading && !isError && rows.length === 0 && (
        <div className="card text-center py-8">
          <div className="h-title">No ranking data yet</div>
          <p className="text-sm opacity-70 mt-1">Ranks appear once students are added and CGPA is available.</p>
        </div>
      )}

      {/* Podium */}
      {rows.length >= 3 && (
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {rows.slice(0, 3).map((s, i) => (
          <motion.button
            key={s.id}
            onClick={() => nav(`/students/${s.reg_no}`)}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`card text-center ${i === 0 ? 'ring-2 ring-ios-orange/40' : ''} hover:shadow-hi transition`}>
            <div className={`inline-flex items-center justify-center rounded-full h-8 w-8 sm:h-10 sm:w-10 text-white font-black text-sm sm:text-base tabular-nums shadow-hi
                ${i === 0 ? 'bg-gradient-to-br from-ios-orange to-ios-red'
                 : i === 1 ? 'bg-gradient-to-br from-ios-blue to-ios-indigo'
                 : 'bg-gradient-to-br from-ios-purple to-ios-pink'}`}>
              {i + 1}
            </div>
            <img src={s.photo} className="mx-auto mt-1 sm:mt-2 h-12 w-12 sm:h-16 sm:w-16 rounded-2xl border-2 border-white shadow-soft bg-white object-cover"/>
            <div className="mt-2 font-semibold text-sm sm:text-base clip-2 break-words">{s.name}</div>
            <div className="text-[11px] opacity-60 clip-1">Sec {s.section || '—'} · Sem {s.semester_number}</div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-1 sm:gap-2">
              <span className="chip text-ios-purple">CGPA {s.cgpa.toFixed(2)}</span>
              <span className="chip text-ios-blue">{s.attendance_pct}%</span>
            </div>
          </motion.button>
        ))}
      </div>
      )}

      {/* Mobile: card list · Desktop: table */}
      <div className="md:hidden space-y-2">
        {rows.map((s, i) => {
          const you = user?.student?.id === s.id;
          return (
            <button key={s.id}
              onClick={() => nav(`/students/${s.reg_no}`)}
              className={`w-full text-left card !p-3 flex items-center gap-3 ${you ? 'ring-2 ring-ios-blue/40' : ''}`}>
              <div className="w-9 text-center font-bold tabular-nums text-ios-blue shrink-0">#{i + 1}</div>
              <img src={s.photo} className="h-10 w-10 rounded-xl bg-white border border-white/60 shrink-0 object-cover"/>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm clip-1">{s.name}</div>
                <div className="text-[11px] opacity-60 clip-1">{s.reg_no} · Sem {s.semester_number} · Sec {s.section || '—'}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold tabular-nums">
                  {sort === 'attendance' ? `${s.attendance_pct}%`
                    : sort === 'sgpa'    ? s.sgpa.toFixed(2)
                    : s.cgpa.toFixed(2)}
                </div>
                <div className="text-[11px] opacity-60 tabular-nums">
                  {sort === 'attendance' ? `CGPA ${s.cgpa.toFixed(2)}` : `${s.attendance_pct}%`}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="hidden md:block card !p-0 overflow-hidden">
        <div className="grid grid-cols-[60px_minmax(0,1fr)_120px_70px_80px_100px_60px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wider opacity-60 font-semibold hairline">
          <div>Rank</div><div>Student</div><div>Reg No</div><div>Sem</div><div>CGPA</div><div>Attendance</div><div>Sec</div>
        </div>
        <div className="max-h-[70vh] overflow-auto no-scrollbar">
          {rows.map((s, i) => {
            const you = user?.student?.id === s.id;
            return (
              <button key={s.id}
                onClick={() => nav(`/students/${s.reg_no}`)}
                className={`w-full text-left grid grid-cols-[60px_minmax(0,1fr)_120px_70px_80px_100px_60px] gap-3 items-center px-5 py-3 hairline
                  ${you ? 'bg-ios-blue/10' : 'hover:bg-white/50 dark:hover:bg-white/5'} transition`}>
                <div className="font-bold tabular-nums">#{i + 1}</div>
                <div className="flex items-center gap-3 min-w-0">
                  <img src={s.photo} className="h-8 w-8 rounded-xl bg-white border border-white/60 shrink-0 object-cover"/>
                  <div className="min-w-0">
                    <div className="clip-1 font-medium">{s.name} {you && <span className="chip text-ios-blue ml-1">You</span>}</div>
                    <div className="text-[11px] opacity-60">Roll · {s.short_roll}</div>
                  </div>
                </div>
                <div className="text-xs tabular-nums opacity-80 clip-1">{s.reg_no}</div>
                <div className="tabular-nums">{s.semester_number}</div>
                <div className="tabular-nums font-semibold">{s.cgpa.toFixed(2)}</div>
                <div className="tabular-nums">{s.attendance_pct}%</div>
                <div>{s.section || '—'}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
