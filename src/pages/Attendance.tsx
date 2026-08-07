import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check, X, ChevronLeft, ChevronRight, RotateCcw,
  Users, ClipboardList, ArrowLeft, CheckCircle2, Loader2, AlertCircle, Save
} from 'lucide-react';
import { motivationEmoji, motivationMessage, classesNeededTo, Student } from '../lib/students';
import { useAuth } from '../lib/auth';
import { useTenant } from '../lib/tenant';
import { useScope } from '../lib/scope';
import { useCollegeStudents, useSubjects, saveAttendanceBatch } from '../lib/liveData';

type Mark = 'present' | 'absent' | 'leave' | null;

export default function Attendance() {
  const { user } = useAuth();
  const { colleges } = useTenant();
  const scope = useScope();

  const college = user?.college_id ? colleges.find(c => c.id === user.college_id) : undefined;
  const depts   = college?.departments ?? [];
  const currentDept = depts.find(d => d.courses.some(c => c.id === scope.courseId)) || depts[0];
  const courses = currentDept?.courses ?? [];
  const course  = courses.find(c => c.id === scope.courseId) || courses[0];
  const sems    = course?.semesters ?? [];
  const sem     = sems.find(s => s.number === scope.semester) || sems[sems.length - 1];
  const sections = sem?.sections ?? ['A', 'B'];

  const { data: subjectList = [] } = useSubjects(user?.college_id);
  const semSubjects = subjectList.filter(s => s.semester === scope.semester);
  const [subjectId, setSubjectId] = useState(semSubjects[0]?.id ?? '');
  useEffect(() => {
    if (semSubjects.length && !semSubjects.find(s => s.id === subjectId))
      setSubjectId(semSubjects[0].id);
  }, [semSubjects.length, scope.semester]);

  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));

  /* Live roster */
  const { data: rosterRaw = [], isLoading: rosterLoading } = useCollegeStudents(user?.college_id, {
    section: scope.section, courseId: scope.courseId, semester: scope.semester
  });
  const roster: Student[] = useMemo(() =>
    [...rosterRaw].sort((a, b) => (a.sl || 0) - (b.sl || 0) || a.reg_no.localeCompare(b.reg_no)),
    [rosterRaw]
  );

  const [i, setI]         = useState(0);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [review, setReview] = useState(false);
  const [savedLabel, setSavedLabel] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<{ index: number; prev: Mark; ts: number } | null>(null);

  const storageKey = `campus.att.v2:${user?.college_id}:${scope.courseId}:${scope.semester}:${scope.section}:${subjectId}:${date}`;

  useEffect(() => {
    setI(0); setReview(false); setSubmitOk(null); setSubmitError(null);
    try {
      const raw = localStorage.getItem(storageKey);
      const stored = raw ? (JSON.parse(raw) as Mark[]) : null;
      if (stored && stored.length === roster.length) setMarks(stored);
      else setMarks(new Array(roster.length).fill(null));
    } catch { setMarks(new Array(roster.length).fill(null)); }
  }, [storageKey, roster.length]);

  useEffect(() => {
    if (!marks.length) return;
    localStorage.setItem(storageKey, JSON.stringify(marks));
    setSavedLabel(new Date().toLocaleTimeString());
  }, [marks, storageKey]);

  const stats = marks.reduce((a, m) => {
    if (m === 'present') a.p++;
    else if (m === 'absent') a.a++;
    else if (m === 'leave') a.l++;
    return a;
  }, { p: 0, a: 0, l: 0 });

  const done  = stats.p + stats.a + stats.l;
  const total = roster.length;
  const current = roster[i];

  const commit = (mark: Exclude<Mark, null>) => {
    setLastAction({ index: i, prev: marks[i], ts: Date.now() });
    setMarks(prev => { const c = [...prev]; c[i] = mark; return c; });
    setTimeout(() => setI(v => Math.min(v + 1, roster.length - 1)), 220);
  };

  const undo = () => {
    if (!lastAction || Date.now() - lastAction.ts > 6000) return;
    setMarks(prev => { const c = [...prev]; c[lastAction.index] = lastAction.prev; return c; });
    setI(lastAction.index);
    setLastAction(null);
  };

  const goPrev = () => setI(v => Math.max(0, v - 1));
  const goNext = () => setI(v => Math.min(roster.length - 1, v + 1));
  const canFinalize = done === total && total > 0 && !!subjectId;

  const finalize = async () => {
    if (!subjectId || !user?.college_id) return;
    setSubmitting(true); setSubmitError(null); setSubmitOk(null);
    try {
      const rows = roster.map((s, idx) => ({
        student_id: s.db_id,
        subject_id: subjectId,
        college_id: user.college_id!,
        taken_on: date,
        status: (marks[idx] ?? 'absent') as 'present'|'absent'|'late'|'leave'
      }));
      const res = await saveAttendanceBatch(rows);
      setSubmitOk(`Saved ${res.inserted} rows to Supabase.`);
      localStorage.removeItem(storageKey);
      setReview(false);
    } catch (e: any) {
      setSubmitError(e?.message || String(e));
    } finally { setSubmitting(false); }
  };

  if (!user) return null;
  if (rosterLoading) return <div className="card flex items-center gap-2"><Loader2 className="animate-spin"/> Loading class roster from Supabase…</div>;
  if (roster.length === 0) return (
    <div className="card">
      <div className="h-title mb-2">No students in this section</div>
      <p className="text-sm opacity-70">Ask your admin to add or import students for Section {scope.section} (Sem {scope.semester}).</p>
    </div>
  );
  if (semSubjects.length === 0) return (
    <div className="card">
      <div className="h-title mb-2">No subjects defined for this semester</div>
      <p className="text-sm opacity-70">Import the semester subjects from the Import Center (or via the seed migrations).</p>
    </div>
  );

  const canUndo = lastAction && Date.now() - lastAction.ts < 6000;

  if (review) {
    return (
      <div className="space-y-4">
        <div className="card">
          <button onClick={() => setReview(false)} className="chip mb-3">
            <ArrowLeft size={12}/> Back to attendance
          </button>
          <div className="h-section">Review & submit</div>
          <div className="h-title mt-1">
            {semSubjects.find(s => s.id === subjectId)?.name} · Section {scope.section} · {new Date(date).toLocaleDateString()}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs sm:text-sm">
            <span className="chip text-ios-green">● Present {stats.p}</span>
            <span className="chip text-ios-red">● Absent {stats.a}</span>
            {stats.l > 0 && <span className="chip text-ios-orange">● Leave {stats.l}</span>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {roster.map((s, idx) => (
            <ReviewRow key={s.reg_no} student={s} mark={marks[idx]}
              onChange={m => setMarks(prev => { const c = [...prev]; c[idx] = m; return c; })}/>
          ))}
        </div>

        {submitError && <div className="rounded-2xl border border-ios-red/30 bg-ios-red/10 px-3 py-2 text-sm flex items-start gap-2 text-ios-red">
          <AlertCircle size={16} className="mt-0.5 shrink-0"/> {submitError}
        </div>}
        {submitOk && <div className="rounded-2xl border border-ios-green/30 bg-ios-green/10 px-3 py-2 text-sm flex items-start gap-2 text-ios-green">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0"/> {submitOk}
        </div>}

        <div className="sticky bottom-24 md:bottom-4 z-30">
          <div className="glass rounded-3xl p-3 flex items-center gap-3">
            <span className="text-sm opacity-80">{stats.p + stats.a + stats.l} / {total} marked</span>
            <button onClick={finalize} disabled={!canFinalize || submitting}
              className="btn-primary ml-auto disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>} Submit to Supabase
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      {/* Big Section A/B toggle */}
      <section className="card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-section flex-1">Section</div>
          <div className="inline-flex rounded-2xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-white/5 p-1">
            {['A','B'].map(sc => (
              <button key={sc} onClick={() => scope.setSection(sc)}
                className={`px-5 py-2 rounded-xl text-sm font-bold transition min-w-[80px]
                  ${scope.section === sc
                    ? 'text-white shadow-hi bg-gradient-to-br from-ios-blue to-ios-indigo'
                    : 'opacity-70 hover:opacity-100'}`}>
                Section {sc}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          <Field label="Department">
            <select value={currentDept?.id ?? ''} onChange={e => {
              const nd = depts.find(d => d.id === e.target.value);
              const nc = nd?.courses[0];
              const ns = nc?.semesters[nc.semesters.length - 1];
              if (nc && ns) scope.setScope({ courseId: nc.id, semester: ns.number });
            }} className="w-full input">
              {depts.map(d => <option key={d.id} value={d.id}>{d.code}</option>)}
            </select>
          </Field>
          <Field label="Course">
            <select value={scope.courseId} onChange={e => scope.setCourse(e.target.value)} className="w-full input">
              {courses.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
            </select>
          </Field>
          <Field label="Semester">
            <select value={scope.semester} onChange={e => scope.setSemester(Number(e.target.value))} className="w-full input">
              {sems.map(s => <option key={s.number} value={s.number}>Sem {s.label}</option>)}
            </select>
          </Field>
          <Field label="Subject">
            <select value={subjectId} onChange={e => setSubjectId(e.target.value)} className="w-full input">
              {semSubjects.map(s => <option key={s.id} value={s.id}>{s.code} · {s.name.slice(0,20)}</option>)}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full input"/>
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs sm:text-sm">
          <span className="chip"><Users size={12}/> {total} students</span>
          <span className="chip text-ios-green">● Present {stats.p}</span>
          <span className="chip text-ios-red">● Absent {stats.a}</span>
          {savedLabel && <span className="chip"><Save size={12}/> Draft saved · {savedLabel}</span>}
        </div>

        <div className="mt-3 h-2 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
          <motion.div className="h-full rounded-full"
            style={{ backgroundImage: 'linear-gradient(90deg,#307DFF,#7F23FF)' }}
            initial={{ width: 0 }} animate={{ width: `${(done/Math.max(total,1))*100}%` }}/>
        </div>
      </section>

      <section className="relative">
        <div className="relative min-h-[440px] sm:min-h-[500px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.reg_no}
              drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.4}
              onDragEnd={(_, info) => {
                if (info.offset.x < -120 || info.velocity.x < -500) commit('present');
                else if (info.offset.x > 120 || info.velocity.x > 500) commit('absent');
              }}
              initial={{ opacity: 0, x: 40, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -40, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 280, damping: 28 }}
              className="mx-auto max-w-[560px] card !p-0 overflow-hidden shadow-card"
            >
              <StudentCard student={current} index={i} total={total} mark={marks[i]}/>
            </motion.div>
          </AnimatePresence>
        </div>

        {i > 0 && <button onClick={goPrev}
          className="hidden md:grid place-items-center absolute left-2 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full glass" aria-label="Previous">
          <ChevronLeft />
        </button>}
        {i < total - 1 && <button onClick={goNext}
          className="hidden md:grid place-items-center absolute right-2 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full glass" aria-label="Next">
          <ChevronRight />
        </button>}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 items-center">
        <button onClick={() => commit('absent')} className="btn-danger w-full">
          <X size={18}/> <span className="hidden xs:inline">Absent</span>
        </button>
        <div className="text-center min-w-[80px]">
          <div className="text-xs opacity-60">Student</div>
          <div className="font-semibold tabular-nums text-sm">{i + 1} <span className="opacity-50">/ {total}</span></div>
        </div>
        <button onClick={() => commit('present')} className="btn-success w-full">
          <Check size={18}/> <span className="hidden xs:inline">Present</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={goPrev} disabled={i === 0} className="chip disabled:opacity-40">
          <ChevronLeft size={14}/> Previous
        </button>
        <button onClick={goNext} disabled={i === total - 1} className="chip disabled:opacity-40">
          Next <ChevronRight size={14}/>
        </button>
        {canUndo && <button onClick={undo} className="chip">
          <RotateCcw size={14}/> Undo
        </button>}
        <button onClick={() => setReview(true)} className="chip ml-auto !text-ios-blue">
          <ClipboardList size={14}/> Review & submit
        </button>
      </div>

      <style>{`.input{padding:.55rem .7rem;border-radius:.9rem;background:rgba(255,255,255,.7);border:1px solid rgba(255,255,255,.6);font-size:14px;outline:none}
        html.dark .input{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.1);color:#fff}
        @media(min-width:400px){.xs\\:inline{display:inline}}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider font-semibold opacity-60 mb-1">{label}</div>
      {children}
    </div>
  );
}

function StudentCard({ student, index, total, mark }: { student: Student; index: number; total: number; mark: Mark }) {
  const pct = student.attendance_pct || 0;
  const need85 = classesNeededTo(85, student.classes_attended, student.total_classes);
  const markColor = mark === 'present' ? 'text-ios-green' : mark === 'absent' ? 'text-ios-red' : mark === 'leave' ? 'text-ios-orange' : 'opacity-40';
  const markLabel = mark ? mark.toUpperCase() : 'NOT MARKED';

  return (
    <div className="flex flex-col">
      <div className="flex items-start justify-between p-4 sm:p-5 pb-0">
        <div className="rounded-2xl px-3 py-1.5 bg-black/80 text-white font-black text-xl sm:text-2xl tracking-tight">
          {student.short_roll}
        </div>
        <div className="text-3xl sm:text-4xl">{motivationEmoji(pct)}</div>
      </div>
      <div className="px-4 sm:px-6 pb-4 flex-1 flex flex-col items-center text-center">
        <div className="relative mt-1">
          <div className="absolute -inset-2 rounded-full blur-2xl opacity-60"
               style={{ backgroundImage: 'linear-gradient(135deg,#307DFF,#7F23FF)' }}/>
          <img src={student.photo}
               className="relative h-28 w-28 sm:h-32 sm:w-32 rounded-full border-4 border-white shadow-hi bg-white object-cover"/>
        </div>
        <div className="mt-3 text-lg sm:text-xl font-bold tracking-tight clip-2 leading-tight">{student.name}</div>
        <div className="text-xs opacity-70">{student.course} · Sem {student.semester} · Sec {student.section}</div>

        <div className="mt-3 w-full grid grid-cols-3 gap-2 sm:gap-3">
          <Metric label="Attendance" value={`${pct}%`} tone="from-ios-blue to-ios-indigo"/>
          <Metric label="Classes"    value={`${student.classes_attended}/${student.total_classes || '—'}`} tone="from-ios-teal to-ios-blue"/>
          <Metric label="CGPA"       value={student.cgpa ? student.cgpa.toFixed(2) : '—'} tone="from-ios-purple to-ios-pink"/>
        </div>
        <div className="mt-3 text-xs sm:text-sm text-center opacity-80 px-2">
          {motivationMessage(pct)}
          {need85 > 0 && <div className="text-[11px] mt-1 opacity-70">Attend <b>{need85}</b> more classes to reach 85%.</div>}
        </div>
        <div className={`mt-3 text-[11px] font-bold uppercase tracking-wider ${markColor}`}>● {markLabel}</div>
      </div>
      <div className="p-3 flex items-center justify-between text-[11px] opacity-60 border-t border-black/5 dark:border-white/10">
        <span>Reg: <b>{student.reg_no}</b></span>
        <span>Student <b>{index + 1}</b> of {total}</span>
      </div>
    </div>
  );
}
function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`rounded-2xl p-2 text-white bg-gradient-to-br ${tone}`}>
      <div className="text-[9px] uppercase tracking-wider opacity-90">{label}</div>
      <div className="text-[15px] sm:text-lg font-bold tabular-nums leading-tight">{value}</div>
    </div>
  );
}
function ReviewRow({ student, mark, onChange }: { student: Student; mark: Mark; onChange: (m: Mark) => void }) {
  return (
    <div className="card !p-3 flex items-center gap-2">
      <img src={student.photo} className="h-10 w-10 rounded-xl border border-white/60 bg-white shrink-0"/>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm clip-1">{student.name}</div>
        <div className="text-[11px] opacity-60 clip-1">Roll {student.short_roll} · {student.reg_no}</div>
      </div>
      <div className="flex gap-1 shrink-0">
        <button onClick={() => onChange('present')}
          className={`h-8 w-8 rounded-lg grid place-items-center ${mark === 'present' ? 'bg-ios-green text-white' : 'bg-white/60 dark:bg-white/10'}`}>
          <Check size={14}/>
        </button>
        <button onClick={() => onChange('absent')}
          className={`h-8 w-8 rounded-lg grid place-items-center ${mark === 'absent' ? 'bg-ios-red text-white' : 'bg-white/60 dark:bg-white/10'}`}>
          <X size={14}/>
        </button>
        <button onClick={() => onChange('leave')}
          className={`h-8 w-8 rounded-lg grid place-items-center text-[10px] font-bold ${mark === 'leave' ? 'bg-ios-orange text-white' : 'bg-white/60 dark:bg-white/10'}`}>L</button>
      </div>
    </div>
  );
}
