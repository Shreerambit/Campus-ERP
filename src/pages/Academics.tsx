import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen, GraduationCap, Trophy, Loader2, AlertCircle, ClipboardList, Layers
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useMyStudent, useStudentAcademics, useCollegeStudents } from '../lib/liveData';
import { HAS_SUPABASE } from '../lib/supabase';

const GRADE_COLOR: Record<string, string> = {
  'O':  'text-ios-green', 'A+': 'text-ios-green', 'A':  'text-ios-teal',
  'B+': 'text-ios-blue',  'B':  'text-ios-blue',  'C':  'text-ios-orange',
  'P':  'text-ios-orange','F':  'text-ios-red'
};

export default function Academics() {
  const { user } = useAuth();
  const collegeId = user?.college_id;
  // If parent portal → use their linked student instead
  const { data: myStudent } = useMyStudent(user?.id, collegeId);

  const targetStudent = myStudent || user?.student;
  const targetStudentId = targetStudent?.db_id;

  const { data, isLoading, isError, error } = useStudentAcademics(targetStudentId, collegeId);
  const { data: allStudents = [] } = useCollegeStudents(collegeId);

  const [selectedSem, setSelectedSem] = useState<number | 'all'>('all');

  const subjects = data?.subjects ?? [];
  const results  = data?.results ?? [];

  // === CGPA = avg(SGPA) across completed semesters (single source of truth) ===
  const semResults = useMemo(
    () => results.filter(r => r.sgpa != null).sort((a, b) => a.semester - b.semester),
    [results]
  );
  const trueCGPA = semResults.length
    ? +(semResults.reduce((a, r) => a + Number(r.sgpa), 0) / semResults.length).toFixed(2)
    : (targetStudent?.cgpa || 0);
  const latestSGPA = semResults.length
    ? Number(semResults[semResults.length - 1].sgpa)
    : (targetStudent?.sgpa || 0);

  const semesters = useMemo(
    () => Array.from(new Set(subjects.map(s => s.semester))).sort((a, b) => a - b),
    [subjects]
  );

  const visible = selectedSem === 'all' ? subjects : subjects.filter(s => s.semester === selectedSem);

  // Ranking — uses the same true CGPA
  const cgpaRank = useMemo(() => {
    if (!targetStudent) return 0;
    const sorted = [...allStudents].sort((a, b) => (b.cgpa || 0) - (a.cgpa || 0));
    return Math.max(1, sorted.findIndex(x => x.reg_no === targetStudent.reg_no) + 1);
  }, [allStudents, targetStudent]);

  if (!user) return null;

  return (
    <div className="space-y-4 min-w-0">
      <header className="card">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-ios-purple to-ios-pink shrink-0">
            <BookOpen size={18}/>
          </div>
          <div className="min-w-0">
            <div className="h-section">Academics</div>
            <div className="h-title clip-1">
              {targetStudent ? `${targetStudent.name} · ${targetStudent.reg_no}` : 'Your academic record'}
            </div>
          </div>
        </div>
      </header>

      {!HAS_SUPABASE && (
        <div className="card border-ios-orange/30 bg-ios-orange/10 text-ios-orange text-sm">
          <AlertCircle size={14} className="inline mr-1"/> Supabase is not connected. Live marks appear once you add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
        </div>
      )}

      {isLoading && <div className="card flex items-center gap-2"><Loader2 className="animate-spin"/> Loading marks & results…</div>}
      {isError && <div className="card border-ios-red/30 bg-ios-red/10 text-ios-red text-sm">
        <AlertCircle size={14} className="inline mr-1"/> {String((error as any)?.message || error)}
      </div>}

      {!isLoading && subjects.length === 0 && (
        <div className="card text-center py-8">
          <div className="h-title">No marks published yet</div>
          <p className="text-sm opacity-70 mt-1">Once your teachers or the university upload results, they will appear here.</p>
        </div>
      )}

      {/* Summary cards */}
      {(results.length > 0 || subjects.length > 0) && (
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard label="Overall CGPA"  value={trueCGPA ? trueCGPA.toFixed(2) : '—'} tone="from-ios-purple to-ios-pink" icon={<GraduationCap size={16}/>}/>
          <SummaryCard label="Latest SGPA"   value={latestSGPA ? latestSGPA.toFixed(2) : '—'} tone="from-ios-teal to-ios-blue" icon={<Layers size={16}/>}/>
          <SummaryCard label="CGPA Rank"     value={cgpaRank > 0 ? `#${cgpaRank}` : '—'} tone="from-ios-orange to-ios-red" icon={<Trophy size={16}/>}/>
          <SummaryCard label="Subjects"      value={String(subjects.length)} tone="from-ios-blue to-ios-indigo" icon={<BookOpen size={16}/>}/>
        </section>
      )}

      {/* Semester breakdown */}
      {results.length > 0 && (
        <section className="card">
          <div className="h-section mb-3">Semester-wise Result</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {results.map(r => (
              <div key={r.id} className="rounded-2xl p-3 bg-white/60 dark:bg-white/5 border border-white/60 dark:border-white/10 text-center">
                <div className="text-[10px] uppercase tracking-wider opacity-60 font-semibold">Sem {['I','II','III','IV','V','VI'][r.semester-1] || r.semester}</div>
                <div className="text-lg font-bold tabular-nums mt-1">{r.sgpa ? r.sgpa.toFixed(2) : '—'}</div>
                <div className="text-[10px] opacity-60">SGPA</div>
                {r.cgpa && (
                  <div className="text-[11px] mt-1 opacity-70">CGPA: <b>{r.cgpa.toFixed(2)}</b></div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Semester filter tabs */}
      {semesters.length > 1 && (
        <div className="h-scroll -mx-1 px-1 pb-1 flex gap-2">
          <button
            onClick={() => setSelectedSem('all')}
            className={`h-snap shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition border
              ${selectedSem === 'all' ? 'text-white shadow-hi border-transparent bg-gradient-to-br from-ios-blue to-ios-indigo'
                : 'bg-white/70 dark:bg-white/5 border-white/60 dark:border-white/10'}`}>All semesters</button>
          {semesters.map(sem => (
            <button key={sem}
              onClick={() => setSelectedSem(sem)}
              className={`h-snap shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition border
                ${selectedSem === sem ? 'text-white shadow-hi border-transparent bg-gradient-to-br from-ios-blue to-ios-indigo'
                  : 'bg-white/70 dark:bg-white/5 border-white/60 dark:border-white/10'}`}>
              Semester {['I','II','III','IV','V','VI'][sem-1] || sem}
            </button>
          ))}
        </div>
      )}

      {/* Subject list — mobile card layout */}
      {visible.length > 0 && (
        <div className="space-y-4">
          {groupBySemester(visible).map(({ sem, items }) => (
            <SemesterBlock key={sem} semester={sem} items={items}/>
          ))}
        </div>
      )}
    </div>
  );
}

function groupBySemester(items: any[]): { sem: number; items: any[] }[] {
  const map = new Map<number, any[]>();
  for (const it of items) {
    if (!map.has(it.semester)) map.set(it.semester, []);
    map.get(it.semester)!.push(it);
  }
  return Array.from(map.entries()).sort((a, b) => a[0] - b[0]).map(([sem, items]) => ({ sem, items }));
}

function SummaryCard({ label, value, tone, icon }: { label: string; value: string; tone: string; icon: React.ReactNode }) {
  return (
    <div className={`rounded-3xl p-3 text-white bg-gradient-to-br ${tone}`}>
      <div className="flex items-center gap-1 text-[11px] opacity-90">{icon}{label}</div>
      <div className="stat-num mt-1">{value}</div>
    </div>
  );
}

function SemesterBlock({ semester, items }: { semester: number; items: any[] }) {
  const total = items.reduce((a, x) => a + x.total, 0);
  const max   = items.reduce((a, x) => a + x.max_total, 0);
  const pct   = max ? Math.round((total / max) * 100) : 0;
  const label = ['I','II','III','IV','V','VI'][semester - 1] || String(semester);

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="card min-w-0">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="h-title clip-1">Semester {label}</div>
        <span className="chip ml-auto">Total: <b className="ml-1 tabular-nums">{total}/{max}</b></span>
        <span className={`chip ${pct >= 60 ? 'text-ios-green' : pct >= 40 ? 'text-ios-orange' : 'text-ios-red'}`}>
          {pct}%
        </span>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {items.map(s => <MobileSubjectRow key={s.subject_id} s={s}/>)}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="text-[11px] uppercase tracking-wider opacity-60 font-semibold">
            <tr className="text-left border-b border-black/5 dark:border-white/10">
              <th className="py-2 pr-3">Code</th>
              <th className="py-2 pr-3">Subject</th>
              <th className="py-2 pr-3 text-right">CIA</th>
              <th className="py-2 pr-3 text-right">SEE</th>
              <th className="py-2 pr-3 text-right">Total</th>
              <th className="py-2 pr-3 text-right">%</th>
              <th className="py-2 pr-3 text-center">Grade</th>
            </tr>
          </thead>
          <tbody>
            {items.map(s => (
              <tr key={s.subject_id} className="hairline">
                <td className="py-2 pr-3 font-mono text-[12px]">{s.code}</td>
                <td className="py-2 pr-3 clip-1">{s.name}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{s.cia ?? '—'} / {s.cia_max}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{s.see ?? '—'} / {s.see_max}</td>
                <td className="py-2 pr-3 text-right tabular-nums font-semibold">{s.total} / {s.max_total}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{s.percentage}%</td>
                <td className={`py-2 pr-3 text-center font-bold ${GRADE_COLOR[s.grade] || ''}`}>{s.grade}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}

function MobileSubjectRow({ s }: { s: any }) {
  return (
    <div className="rounded-2xl p-3 bg-white/60 dark:bg-white/5 border border-white/60 dark:border-white/10">
      <div className="flex items-center gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm clip-1">{s.name}</div>
          <div className="text-[11px] opacity-60 clip-1">{s.code} · {s.credits} credits</div>
        </div>
        <span className={`chip ${GRADE_COLOR[s.grade] || ''} font-bold`}>{s.grade}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-white/60 dark:bg-white/10 py-1.5">
          <div className="text-[9px] uppercase opacity-60">CIA</div>
          <div className="text-sm font-semibold tabular-nums">{s.cia ?? '—'}/{s.cia_max}</div>
        </div>
        <div className="rounded-lg bg-white/60 dark:bg-white/10 py-1.5">
          <div className="text-[9px] uppercase opacity-60">SEE</div>
          <div className="text-sm font-semibold tabular-nums">{s.see ?? '—'}/{s.see_max}</div>
        </div>
        <div className="rounded-lg bg-white/60 dark:bg-white/10 py-1.5">
          <div className="text-[9px] uppercase opacity-60">Total</div>
          <div className="text-sm font-semibold tabular-nums">{s.total}/{s.max_total}</div>
        </div>
      </div>
    </div>
  );
}
