import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Building2, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useTenant } from '../lib/tenant';
import { useScope } from '../lib/scope';
import { useTimetable, useMySectionId } from '../lib/liveData';

const SUBJECT_TONES = [
  'from-ios-blue to-ios-indigo',
  'from-ios-green to-ios-teal',
  'from-ios-purple to-ios-pink',
  'from-ios-orange to-ios-red',
  'from-ios-teal to-ios-blue',
  'from-ios-pink to-ios-red'
];
// Deterministic color per subject. If code is missing, hash on the name
// (or anything unique) so cells never appear invisible.
function toneFor(seed: string | null | undefined) {
  const s = (seed && seed.trim()) || 'default';
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SUBJECT_TONES[h % SUBJECT_TONES.length];
}

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export default function Timetable() {
  const { user } = useAuth();
  const { findCollege } = useTenant();
  const college = user?.college_id ? findCollege(user.college_id) : undefined;

  const scope = useScope();
  const { data: sectionId, isLoading: loadingSec } = useMySectionId(scope.courseId, scope.semester, scope.section);
  const { data: slots = [], isLoading, isError, error, refetch, isFetching } =
    useTimetable(user?.college_id, sectionId || undefined);

  // Course/sem/section pickers for teacher/admin
  const dept = college?.departments.find(d => d.courses.some(c => c.id === scope.courseId));
  const currentCourse = dept?.courses.find(c => c.id === scope.courseId);
  const availableSems = currentCourse?.semesters || [];
  const availableSections = availableSems.find(s => s.number === scope.semester)?.sections || ['A','B'];

  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const days = [1,2,3,4,5,6]; // Mon..Sat

  const byDay = useMemo(() => {
    const map = new Map<number, typeof slots>();
    for (const s of slots) {
      if (!map.has(s.day_of_week)) map.set(s.day_of_week, []);
      map.get(s.day_of_week)!.push(s);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.start_time.localeCompare(b.start_time));
    return map;
  }, [slots]);

  const timeSlots = useMemo(() => {
    const set = new Set<string>();
    slots.forEach(s => set.add(`${s.start_time}|${s.end_time}`));
    return Array.from(set).sort();
  }, [slots]);

  const title = `${currentCourse?.code || 'Course'} · Sem ${['I','II','III','IV','V','VI'][scope.semester-1] || scope.semester} · Section ${scope.section}`;
  const sub = college ? `${college.short}${college.city ? ' · ' + college.city : ''}` : '';

  return (
    <div className="space-y-6 min-w-0">
      <div className="card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-10 w-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-ios-blue to-ios-indigo shrink-0">
            <CalendarDays size={18}/>
          </div>
          <div className="flex-1 min-w-[160px] no-x">
            <div className="h-section">Time Table</div>
            <div className="h-title clip-1">{title}</div>
            <div className="text-xs opacity-60 mt-0.5 flex items-center gap-1.5 clip-1">
              <Building2 size={12} className="shrink-0"/> {sub}
            </div>
          </div>
          <button onClick={() => refetch()} className="chip" title="Refresh">
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''}/> Refresh
          </button>
        </div>

        {/* Teacher / Admin can pick any course/sem/section */}
        {!scope.locked && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <select value={scope.courseId} onChange={e => scope.setCourse(e.target.value)}
              className="rounded-xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 px-2 py-2 text-sm">
              {college?.departments.flatMap(d => d.courses).map(c =>
                <option key={c.id} value={c.id}>{c.code}</option>
              )}
            </select>
            <select value={scope.semester} onChange={e => scope.setSemester(Number(e.target.value))}
              className="rounded-xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 px-2 py-2 text-sm">
              {availableSems.map(s => <option key={s.number} value={s.number}>Sem {s.label}</option>)}
            </select>
            <select value={scope.section} onChange={e => scope.setSection(e.target.value)}
              className="rounded-xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 px-2 py-2 text-sm">
              {availableSections.map(s => <option key={s} value={s}>Sec {s}</option>)}
            </select>
          </div>
        )}
      </div>

      {(isLoading || loadingSec) && <div className="card flex items-center gap-2"><Loader2 className="animate-spin"/> Loading timetable…</div>}
      {isError && <div className="card border-ios-red/30 bg-ios-red/10 text-ios-red text-sm">
        <AlertCircle size={14} className="inline mr-1"/> {String((error as any)?.message || error)}
        <button onClick={() => refetch()} className="chip ml-2">Retry</button>
      </div>}
      {!isLoading && !isError && !loadingSec && slots.length === 0 && (
        <div className="card text-center py-8">
          <div className="h-title">No timetable published yet</div>
          <p className="text-sm opacity-70 mt-1">Once your admin uploads a timetable for this section, it will appear here.</p>
          {!sectionId && (
            <p className="text-xs opacity-60 mt-2">
              (Section {scope.section} for Sem {scope.semester} isn't registered in the database yet.)
            </p>
          )}
        </div>
      )}

      {slots.length > 0 && (
        <>
          <div className="card !p-0 overflow-hidden">
            <div className="overflow-x-auto no-scrollbar">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[96px_repeat(6,minmax(150px,1fr))] text-[11px] uppercase tracking-wider opacity-70 font-semibold px-3 sm:px-4 py-3 gap-2 sticky top-0 z-10 bg-white/80 dark:bg-white/10 backdrop-blur">
                  <div className="sticky left-0 bg-white/80 dark:bg-white/10 z-10 pl-1">Time</div>
                  {['Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d}>{d}</div>)}
                </div>
                {timeSlots.map(ts => {
                  const [start, end] = ts.split('|');
                  return (
                    <div key={ts} className="grid grid-cols-[96px_repeat(6,minmax(150px,1fr))] gap-2 px-3 sm:px-4 py-2 hairline items-stretch">
                      <div className="text-[11px] tabular-nums opacity-70 flex items-center sticky left-0 bg-white/60 dark:bg-white/[0.03] backdrop-blur rounded-lg pl-1">
                        {start.slice(0,5)}
                      </div>
                      {days.map(dow => {
                        const cell = byDay.get(dow)?.find(x => x.start_time === start && x.end_time === end);
                        if (!cell) return <div key={dow} className="rounded-2xl border border-dashed border-black/10 dark:border-white/10 p-2 text-center text-xs opacity-40">—</div>;
                        const tone = toneFor(cell.subject_code || cell.subject_name);
                        const isToday = DAY_NAMES[dow] === dayName;
                        return (
                          <div key={dow}
                            className={`rounded-2xl p-2 sm:p-2.5 text-white bg-gradient-to-br ${tone} shadow-soft ${isToday ? 'ring-2 ring-white' : ''}`}>
                            <div className="text-[11px] opacity-90 font-semibold">{cell.subject_code || cell.slot_type}</div>
                            <div className="text-[12px] sm:text-[13px] font-bold leading-tight clip-2">{cell.subject_name || '—'}</div>
                            <div className="text-[10px] opacity-90 mt-1 clip-1">{cell.teacher_name || '—'}</div>
                            {cell.room && <div className="text-[10px] opacity-80">{cell.room.trim().match(/^room\s/i) ? cell.room.trim() : `Room ${cell.room.trim()}`}</div>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Day view */}
          <div>
            <div className="h-section mb-3">Day view</div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
              {days.map(dow => {
                const dayList = (byDay.get(dow) || []);
                return (
                  <motion.div key={dow}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className={`card ${DAY_NAMES[dow] === dayName ? 'ring-2 ring-ios-blue/40' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="h-title">{DAY_NAMES[dow]}</div>
                      {DAY_NAMES[dow] === dayName && <span className="chip text-ios-blue">Today</span>}
                    </div>
                    <div className="space-y-2">
                      {dayList.length === 0 && <p className="text-xs opacity-60">No classes.</p>}
                      {dayList.map(s => (
                        <div key={s.id} className="rounded-2xl p-3 border border-white/60 dark:border-white/10 bg-white/60 dark:bg-white/5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[11px] opacity-60">{s.start_time.slice(0,5)} – {s.end_time.slice(0,5)}</div>
                              <div className="font-semibold clip-1">{s.subject_name}</div>
                            </div>
                            <span className="chip shrink-0">{s.subject_code || s.slot_type}</span>
                          </div>
                          <div className="text-[11px] opacity-70 mt-1">
                            {s.teacher_name || 'Faculty'}{s.room ? ` · ${s.room.trim().match(/^room\s/i) ? s.room.trim() : `Room ${s.room.trim()}`}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
