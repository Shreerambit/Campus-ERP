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

function safeNum(v: any): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function formatCgpa(v: any): string {
  const n = safeNum(v);
  return n > 0 ? n.toFixed(2) : '—';
}

function formatPct(v: any): string {
  const n = safeNum(v);
  return `${Math.round(n * 10) / 10}%`;
}

export default function Leaderboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [sort, setSort] = useState<Sort>('cgpa');
  const [section, setSection] = useState<string>('All');
  const [semester, setSemester] = useState<string>('All');
  const [q, setQ] = useState('');

  const collegeId = user?.college_id || '11111111-1111-1111-1111-111111111111';
  const { data: all = [], isLoading, isError, error, refetch, isFetching } = useCollegeStudentsWithAttendance(collegeId);

  const sections   = useMemo(() => Array.from(new Set(all.map(s => s?.section).filter(Boolean))).sort(), [all]);
  const semesters  = useMemo(() => Array.from(new Set(all.map(s => String(s?.semester_number || s?.semester || '')).filter(Boolean))).sort(), [all]);

  const rows = useMemo(() => {
    let arr = [...all].filter(s => !!s && !!s.name);
    if (section !== 'All') arr = arr.filter(s => s.section === section);
    if (semester !== 'All') arr = arr.filter(s => String(s.semester_number || s.semester) === semester);
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      arr = arr.filter(s => (s.name || '').toLowerCase().includes(t) || (s.reg_no || '').toLowerCase().includes(t));
    }

    const byName = (a: any, b: any) => (a.name || '').localeCompare(b.name || '');
    if (sort === 'cgpa') {
      arr.sort((a, b) => (safeNum(b.cgpa) - safeNum(a.cgpa)) || byName(a, b));
    } else if (sort === 'sgpa') {
      arr.sort((a, b) => (safeNum(b.sgpa) - safeNum(a.sgpa)) || byName(a, b));
    } else if (sort === 'attendance') {
      arr.sort((a, b) => (safeNum(b.attendance_pct) - safeNum(a.attendance_pct)) || byName(a, b));
    } else {
      const score = (s: any) => (safeNum(s.cgpa) * 10 * 0.6) + (safeNum(s.attendance_pct) * 0.4);
      arr.sort((a, b) => (score(b) - score(a)) || byName(a, b));
    }
    return arr;
  }, [sort, section, semester, q, all]);

  const myRegNo = user?.student?.reg_no || user?.id;

  return (
    <div className="space-y-6 min-w-0 pb-16">
      <div className="card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-10 w-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-ios-orange to-ios-red shrink-0 shadow-md">
            <Trophy size={18}/>
          </div>
          <div className="flex-1 min-w-[160px] no-x">
            <div className="h-section text-xs uppercase tracking-wider opacity-70">Rankings & Leaderboard</div>
            <div className="h-title text-base sm:text-lg font-bold clip-1">
              {rows.length} Students · Sorted by {LABELS[sort]}
            </div>
          </div>
          <button onClick={() => refetch()} className="chip hover:bg-white/80 dark:hover:bg-white/15">
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''}/> Refresh
          </button>
        </div>

        {/* Controls */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-white/60 dark:border-white/10 bg-white/70 dark:bg-white/5 p-1 shadow-sm">
            {(['overall', 'cgpa', 'sgpa', 'attendance'] as Sort[]).map(k => (
              <button key={k} onClick={() => setSort(k)}
                className={`rounded-full px-3 py-1.5 text-xs sm:text-sm font-semibold transition
                ${sort === k ? 'text-white shadow-md bg-gradient-to-br from-ios-blue to-ios-indigo' : 'opacity-70 hover:opacity-100'}`}>{LABELS[k]}</button>
            ))}
          </div>
          <select value={semester} onChange={e => setSemester(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 text-xs sm:text-sm outline-none">
            <option value="All">All Semesters</option>
            {semesters.map(s => <option key={s} value={s}>Sem {['I','II','III','IV','V','VI'][Number(s)-1] || s}</option>)}
          </select>
          <select value={section} onChange={e => setSection(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 text-xs sm:text-sm outline-none">
            <option value="All">All Sections</option>
            {sections.map(s => <option key={s} value={s}>Section {s}</option>)}
          </select>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 flex-1 min-w-[160px]">
            <Search size={14} className="opacity-60"/>
            <input placeholder="Search student name or USN…" value={q} onChange={e => setQ(e.target.value)}
              className="bg-transparent outline-none text-xs sm:text-sm w-full"/>
          </div>
        </div>
      </div>

      {isLoading && <div className="card flex items-center gap-2 py-8 justify-center text-sm"><Loader2 className="animate-spin text-ios-blue"/> Loading rankings…</div>}
      {isError && <div className="card border-ios-red/30 bg-ios-red/10 text-ios-red text-sm">
        <AlertCircle size={14} className="inline mr-1"/> {String((error as any)?.message || error)}
        <button onClick={() => refetch()} className="chip ml-2">Retry</button>
      </div>}
      {!isLoading && !isError && rows.length === 0 && (
        <div className="card text-center py-10">
          <div className="h-title font-bold text-base">No ranking records found</div>
          <p className="text-xs sm:text-sm opacity-70 mt-1">Try resetting the semester or section filter.</p>
        </div>
      )}

      {/* Podium for Top 3 */}
      {rows.length >= 3 && (
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {rows.slice(0, 3).map((s, i) => {
          const you = s.reg_no === myRegNo;
          return (
            <motion.button
              key={s.id || s.reg_no}
              onClick={() => nav(`/students/${s.reg_no}`)}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={`card text-center ${i === 0 ? 'ring-2 ring-ios-orange/60 shadow-lg' : ''} ${you ? 'ring-2 ring-ios-blue' : ''} hover:shadow-hi transition !p-3 sm:!p-5`}>
              <div className={`inline-flex items-center justify-center rounded-full h-7 w-7 sm:h-9 sm:w-9 text-white font-black text-xs sm:text-sm tabular-nums shadow-md
                  ${i === 0 ? 'bg-gradient-to-br from-ios-orange to-ios-red'
                   : i === 1 ? 'bg-gradient-to-br from-ios-blue to-ios-indigo'
                   : 'bg-gradient-to-br from-ios-purple to-ios-pink'}`}>
                {i + 1}
              </div>
              <img src={s.photo || `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(s.reg_no)}`}
                className="mx-auto mt-1 sm:mt-2 h-11 w-11 sm:h-16 sm:w-16 rounded-2xl border-2 border-white/80 shadow-sm bg-white object-cover"/>
              <div className="mt-2 font-bold text-xs sm:text-sm clip-2 break-words text-gray-900 dark:text-white">
                {s.name} {you && <span className="text-[10px] text-ios-blue font-bold">(You)</span>}
              </div>
              <div className="text-[10px] opacity-60 clip-1 mt-0.5">Sec {s.section || '—'} · Sem {s.semester_number || s.semester || 5}</div>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-1">
                <span className="chip text-ios-purple text-[10px] font-bold">CGPA {formatCgpa(s.cgpa)}</span>
                <span className="chip text-ios-blue text-[10px]">{formatPct(s.attendance_pct)}</span>
              </div>
            </motion.button>
          );
        })}
      </div>
      )}

      {/* Mobile: card list */}
      <div className="md:hidden space-y-2">
        {rows.map((s, i) => {
          const you = s.reg_no === myRegNo;
          return (
            <button key={s.id || s.reg_no}
              onClick={() => nav(`/students/${s.reg_no}`)}
              className={`w-full text-left card !p-3 flex items-center gap-3 ${you ? 'ring-2 ring-ios-blue/60 bg-ios-blue/5' : ''}`}>
              <div className={`w-8 text-center font-bold tabular-nums shrink-0 ${i < 3 ? 'text-ios-orange font-black' : 'text-ios-blue'}`}>
                #{i + 1}
              </div>
              <img src={s.photo || `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(s.reg_no)}`}
                className="h-10 w-10 rounded-xl bg-white border border-white/60 shrink-0 object-cover"/>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-xs sm:text-sm clip-1 text-gray-900 dark:text-white">
                  {s.name} {you && <span className="chip !text-[10px] !py-0 !px-1.5 text-ios-blue font-bold ml-1">You</span>}
                </div>
                <div className="text-[10px] opacity-60 clip-1 mt-0.5">{s.reg_no} · Sem {s.semester_number || s.semester || 5} · Sec {s.section || '—'}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs sm:text-sm font-bold tabular-nums text-gray-900 dark:text-white">
                  {sort === 'attendance' ? formatPct(s.attendance_pct)
                    : sort === 'sgpa'    ? formatCgpa(s.sgpa)
                    : `CGPA ${formatCgpa(s.cgpa)}`}
                </div>
                <div className="text-[10px] opacity-60 tabular-nums">
                  {sort === 'attendance' ? `CGPA ${formatCgpa(s.cgpa)}` : formatPct(s.attendance_pct)}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block card !p-0 overflow-hidden">
        <div className="grid grid-cols-[60px_minmax(0,1fr)_120px_70px_80px_100px_60px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wider opacity-60 font-semibold hairline">
          <div>Rank</div><div>Student</div><div>Reg No</div><div>Sem</div><div>CGPA</div><div>Attendance</div><div>Sec</div>
        </div>
        <div className="max-h-[70vh] overflow-auto no-scrollbar divide-y divide-black/5 dark:divide-white/5">
          {rows.map((s, i) => {
            const you = s.reg_no === myRegNo;
            return (
              <button key={s.id || s.reg_no}
                onClick={() => nav(`/students/${s.reg_no}`)}
                className={`w-full text-left grid grid-cols-[60px_minmax(0,1fr)_120px_70px_80px_100px_60px] gap-3 items-center px-5 py-3
                  ${you ? 'bg-ios-blue/10' : 'hover:bg-white/50 dark:hover:bg-white/5'} transition`}>
                <div className="font-bold tabular-nums text-sm">#{i + 1}</div>
                <div className="flex items-center gap-3 min-w-0">
                  <img src={s.photo || `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(s.reg_no)}`}
                    className="h-8 w-8 rounded-xl bg-white border border-white/60 shrink-0 object-cover"/>
                  <div className="min-w-0">
                    <div className="clip-1 font-medium text-sm text-gray-900 dark:text-white">
                      {s.name} {you && <span className="chip !text-[10px] text-ios-blue ml-1 font-bold">You</span>}
                    </div>
                    <div className="text-[11px] opacity-60">Roll · {s.short_roll || String(s.reg_no).slice(-3)}</div>
                  </div>
                </div>
                <div className="text-xs tabular-nums opacity-80 clip-1 font-mono">{s.reg_no}</div>
                <div className="tabular-nums text-sm">{s.semester_number || s.semester || 5}</div>
                <div className="tabular-nums font-semibold text-sm">{formatCgpa(s.cgpa)}</div>
                <div className="tabular-nums text-sm">{formatPct(s.attendance_pct)}</div>
                <div className="text-sm font-medium">{s.section || '—'}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
