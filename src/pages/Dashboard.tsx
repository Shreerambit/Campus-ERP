import { useMemo } from 'react';
import { classesNeededTo, Student } from '../lib/students';
import { motion } from 'framer-motion';
import {
  ClipboardCheck, Trophy, GraduationCap, BookOpen, CalendarClock, Wallet, FileSignature,
  ArrowUpRight, TrendingUp, TrendingDown, Loader2, Megaphone, Users, Upload, Sparkles, MapPin,
  AlertTriangle, Target, Lightbulb, Camera as CameraIcon
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend
} from 'chart.js';
import { useAuth } from '../lib/auth';
import {
  useCollegeStudents, useMyStudent, useNotices, useStudentAttendance,
  useStudentAttendanceBySubject,
  useTimetable, useMySectionId, useStudentAcademics, useStudentRanks
} from '../lib/liveData';
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const HELLO = (() => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
})();
const TODAY = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export default function Dashboard() {
  const { user } = useAuth();
  const { data: liveStudent, isLoading: loadingStudent } = useMyStudent(user?.id, user?.college_id);
  const { data: allStudents = [] } = useCollegeStudents(user?.college_id);
  const { data: notices = [] } = useNotices(user?.college_id);

  if (user && user.role !== 'student' && user.role !== 'parent') {
    return <StaffWelcome name={user.displayName} role={user.role} notices={notices as any}/>;
  }
  if (loadingStudent) return <div className="card flex items-center gap-2"><Loader2 className="animate-spin"/> Loading your dashboard…</div>;

  const s: Student | undefined = liveStudent || user?.student;
  if (!s) return (
    <div className="card">
      <div className="h-title">We couldn't find your record</div>
      <p className="text-sm opacity-70 mt-1">Ask your college admin to add you, then log in again.</p>
    </div>
  );

  return <StudentDashboard s={s} allStudents={allStudents} notices={notices as any}/>;
}

function StudentDashboard({ s, allStudents, notices }: { s: Student; allStudents: Student[]; notices: any[] }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const isStudent = user?.role === 'student';
  const { data: attSummary } = useStudentAttendance(s.db_id);
  const { data: attBySubject } = useStudentAttendanceBySubject(s.db_id, s.college_id);
  const { data: sectionId } = useMySectionId(s.course_id, s.semester_number, s.section);
  const { data: slots = [] } = useTimetable(s.college_id, sectionId || undefined);
  const { data: academics } = useStudentAcademics(s.db_id, s.college_id);
  const { data: ranks } = useStudentRanks(s.college_id, s.reg_no, s.section);

  // === CGPA = average of all completed SGPAs (per spec) ===
  const semResults = (academics?.results || []).filter(r => r.sgpa != null).sort((a, b) => a.semester - b.semester);
  const trueCGPA = semResults.length
    ? semResults.reduce((a, r) => a + Number(r.sgpa), 0) / semResults.length
    : s.cgpa || 0;
  const latestSGPA = semResults.length ? Number(semResults[semResults.length - 1].sgpa) : null;

  // === BACKLOGS: subjects where student scored below 40% or has grade 'F' ===
  const backlogs = useMemo(() => {
    const subs = academics?.subjects || [];
    return subs
      .filter(s => s.grade === 'F' || (s.max_total > 0 && s.total < s.max_total * 0.4))
      .sort((a, b) => a.semester - b.semester || a.code.localeCompare(b.code));
  }, [academics]);

  const trend = useMemo(() => {
    if (semResults.length < 2) return null;
    const last = Number(semResults[semResults.length - 1].sgpa);
    const prev = Number(semResults[semResults.length - 2].sgpa);
    return { last, prev, diff: +(last - prev).toFixed(2) };
  }, [semResults]);

  const pct = attSummary?.pct ?? 0;
  const attended = attSummary?.present ?? 0;
  const totalClasses = attSummary?.total ?? 0;
  const need85 = classesNeededTo(85, attended, totalClasses);

  const dow = new Date().getDay();
  const todaySlots = slots.filter(x => x.day_of_week === dow).sort((a, b) => a.start_time.localeCompare(b.start_time));
  const dayName = DAY_NAMES[dow];

  // Current & next class
  const nowStr = new Date().toTimeString().slice(0, 8);
  const currentClass = todaySlots.find(x => nowStr >= x.start_time && nowStr < x.end_time);
  const nextClass = todaySlots.find(x => x.start_time > nowStr);

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <motion.section layout className="card overflow-hidden relative">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-40"
             style={{ background: 'radial-gradient(closest-side, rgba(48,125,255,.5), transparent)' }} />
        <div className="absolute -left-24 -bottom-24 h-72 w-72 rounded-full opacity-30"
             style={{ background: 'radial-gradient(closest-side, rgba(127,35,255,.5), transparent)' }} />

        <div className="relative flex flex-col md:flex-row md:items-center gap-5">
          <button onClick={() => nav('/profile')}
            className="relative group shrink-0 self-start md:self-auto"
            title="Tap to update your profile photo">
            <img src={s.photo}
                 className="h-20 w-20 rounded-2xl border border-white/70 shadow-soft bg-white object-cover
                            transition group-hover:brightness-90"/>
            <span className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-ios-blue text-white grid place-items-center shadow-hi ring-2 ring-white dark:ring-black">
              <CameraIcon size={12}/>
            </span>
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-sm opacity-70">{TODAY}</div>
            <h1 className="h-display">{HELLO}, {s.name.split(' ')[0]}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="chip">{s.department}</span>
              <span className="chip">Sem {s.semester}</span>
              <span className="chip">Section {s.section}</span>
              <span className="chip">Roll · {s.short_roll}</span>
              <span className="chip">Reg · {s.reg_no}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatMini label="Attendance" value={totalClasses ? `${pct}%` : '—'} tone="blue" icon={<ClipboardCheck size={16}/>}/>
            <StatMini label="CGPA" value={trueCGPA ? trueCGPA.toFixed(2) : '—'} tone="purple" icon={<GraduationCap size={16}/>}/>
            <StatMini label="Rank" value={ranks?.overall.rank ? `#${ranks.overall.rank}` : '—'} tone="orange" icon={<Trophy size={16}/>}/>
          </div>
        </div>
      </motion.section>

      {/* ERP AI promo card — students only */}
      {isStudent && (
      <motion.button
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        onClick={() => nav('/erp-ai')}
        className="w-full text-left rounded-3xl p-4 sm:p-5 shadow-hi text-white flex items-center gap-4 relative overflow-hidden"
        style={{ backgroundImage: 'linear-gradient(120deg,#307DFF 0%,#3C3DFF 55%,#7F23FF 100%)' }}>
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl"/>
        <div className="h-12 w-12 rounded-2xl bg-white/20 grid place-items-center backdrop-blur shrink-0">
          <Sparkles size={22}/>
        </div>
        <div className="min-w-0 flex-1 relative">
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-90">ERP AI</div>
          <div className="font-bold text-[15px] sm:text-lg clip-1">
            Ask AI about your marks, CGPA, backlogs, and notes
          </div>
          <div className="text-[12px] opacity-90 mt-0.5">Personal academic intelligence — always knows your data, never asks who you are.</div>
        </div>
        <ArrowUpRight size={20} className="shrink-0 opacity-90"/>
      </motion.button>
      )}

      {/* Motivation banner */}
      {trend && (
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-3xl p-4 sm:p-5 shadow-hi text-white flex items-center gap-4
            bg-gradient-to-r ${trend.diff >= 0.5 ? 'from-ios-green to-ios-teal'
              : trend.diff > 0 ? 'from-ios-blue to-ios-indigo'
              : trend.diff === 0 ? 'from-ios-purple to-ios-indigo'
              : trend.diff > -0.5 ? 'from-ios-orange to-ios-yellow'
              : 'from-ios-red to-ios-pink'}`}>
          <div className="h-11 w-11 rounded-2xl bg-white/20 grid place-items-center backdrop-blur shrink-0">
            {trend.diff >= 0 ? <TrendingUp size={22}/> : <TrendingDown size={22}/>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-90 flex items-center gap-1.5">
              <Sparkles size={12}/> Your progress
            </div>
            <div className="font-bold text-[15px] sm:text-base clip-1">
              {trend.diff > 0
                ? `SGPA improved by ${trend.diff.toFixed(2)} — keep going!`
                : trend.diff === 0
                  ? 'SGPA held steady — aim higher this semester.'
                  : `SGPA slipped by ${Math.abs(trend.diff).toFixed(2)} — you can bounce back.`}
            </div>
            <div className="text-[12px] opacity-90 mt-0.5">
              Last SGPA: <b>{trend.last.toFixed(2)}</b> · Previous: <b>{trend.prev.toFixed(2)}</b>
            </div>
          </div>
        </motion.div>
      )}

      {/* Backlogs — failed subjects & improvement path */}
      {backlogs.length > 0 && <BacklogsCard backlogs={backlogs} pct={pct} cgpa={trueCGPA}/>}

      {/* Current + next class banner */}
      {(currentClass || nextClass) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {currentClass && <ClassCard label="Now in class" slot={currentClass} tone="from-ios-green to-ios-teal"/>}
          {nextClass    && <ClassCard label={currentClass ? 'Next class' : 'Coming up'} slot={nextClass} tone="from-ios-blue to-ios-indigo"/>}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's classes */}
        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="h-section">Today</div>
              <div className="h-title">Your Classes · {dayName}</div>
            </div>
            <button onClick={() => nav('/timetable')} className="chip"><CalendarClock size={14}/> View timetable</button>
          </div>
          {todaySlots.length === 0
            ? <p className="text-sm opacity-60">No classes scheduled today.</p>
            : <div className="space-y-2">
                {todaySlots.map((sl) => (
                  <div key={sl.id} className={`flex items-center gap-4 rounded-2xl p-3 border
                    ${currentClass?.id === sl.id
                      ? 'bg-ios-green/10 border-ios-green/30'
                      : 'bg-white/60 dark:bg-white/5 border-white/60 dark:border-white/10'}`}>
                    <div className="w-24 text-xs tabular-nums font-semibold opacity-80">
                      {sl.start_time.slice(0,5)} – {sl.end_time.slice(0,5)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold clip-1">{sl.subject_name || sl.subject_code || '—'}</div>
                      <div className="text-xs opacity-60 clip-1">
                        {sl.teacher_name || '—'}{sl.room ? ` · ${sl.room}` : ''}
                      </div>
                    </div>
                    <span className={`chip ${sl.slot_type === 'Lab' ? 'text-ios-purple' : sl.slot_type === 'Tutorial' ? 'text-ios-orange' : 'text-ios-blue'}`}>
                      {sl.slot_type}
                    </span>
                  </div>
                ))}
              </div>}
        </section>

        {/* Attendance — overall + per subject */}
        <section className="card">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-section flex-1">Attendance</div>
            <span className="chip text-[10px]">Overall</span>
          </div>
          <div className="flex items-center gap-5">
            <Ring value={pct}/>
            <div>
              <div className="stat-num">{totalClasses ? `${pct}%` : '—'}</div>
              <div className="text-sm opacity-70">{attended} of {totalClasses} classes</div>
              <div className="text-xs mt-2 opacity-70 flex items-center gap-1">
                <TrendingUp size={12} className="text-ios-green"/>
                {totalClasses === 0
                  ? 'No attendance recorded yet.'
                  : need85 === 0 ? 'You are above the 85% target.' : `Attend ${need85} more classes to reach 85%.`}
              </div>
            </div>
          </div>

          {(attBySubject?.subjects?.length ?? 0) > 0 && (
            <>
              <div className="hairline my-4"/>
              <div className="text-[11px] uppercase tracking-wider opacity-60 font-semibold mb-2">
                By subject
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(attBySubject!.subjects).map(sub => {
                  const tone = sub.pct >= 85 ? 'from-ios-green to-ios-teal'
                    : sub.pct >= 75 ? 'from-ios-blue to-ios-indigo'
                    : sub.pct >= 60 ? 'from-ios-orange to-ios-yellow'
                    : 'from-ios-red to-ios-pink';
                  return (
                    <div key={sub.subject_id} className="rounded-2xl p-3 border border-white/60 dark:border-white/10 bg-white/60 dark:bg-white/5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs opacity-60">{sub.code}</div>
                          <div className="font-semibold clip-1 text-sm">{sub.name}</div>
                        </div>
                        <div className={`shrink-0 rounded-xl px-2.5 py-1 text-white text-xs font-bold tabular-nums bg-gradient-to-br ${tone}`}>
                          {sub.pct}%
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] opacity-70 tabular-nums">
                        {sub.present}/{sub.total} classes · {sub.absent} absent
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
                        <div className={`h-full rounded-full bg-gradient-to-r ${tone}`} style={{ width: `${Math.min(100, sub.pct)}%` }}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {/* Ranks */}
        <section className="card">
          <div className="h-section mb-3">Your Ranks</div>
          <div className="grid grid-cols-3 gap-3">
            <RankCard label="Overall"    rank={ranks?.overall.rank || 0}    total={ranks?.overall.total || 0}    tone="blue"/>
            <RankCard label={`Section ${s.section}`} rank={ranks?.sectionRank.rank || 0} total={ranks?.sectionRank.total || 0} tone="purple"/>
            <RankCard label="Attendance" rank={ranks?.attendance.rank || 0} total={ranks?.attendance.total || 0} tone="green"/>
          </div>
          <div className="hairline my-4"/>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Latest SGPA" value={latestSGPA ? latestSGPA.toFixed(2) : '—'}/>
            <MiniStat label="Overall CGPA" value={trueCGPA ? trueCGPA.toFixed(2) : '—'}/>
          </div>
        </section>

        {/* Progress graph */}
        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="h-section">Academic Progress</div>
              <div className="h-title">SGPA & CGPA trend</div>
            </div>
            <button onClick={() => nav('/academics')} className="chip"><BookOpen size={14}/> View marks</button>
          </div>
          <ProgressChart results={semResults}/>
        </section>

        {/* Quick actions */}
        <section className="card">
          <div className="h-section mb-3">Quick Actions</div>
          <div className="grid grid-cols-2 gap-3">
            <Quick icon={<BookOpen size={18}/>}       title="Academics"       desc="Marks & CGPA"        to="/academics"/>
            <Quick icon={<Megaphone size={18}/>}      title="Notices"         desc="Latest updates"      to="/notices"/>
            <Quick icon={<FileSignature size={18}/>}  title="Leave"           desc="Apply / track"       to="/leave"/>
            <Quick icon={<Users size={18}/>}          title="Directory"       desc="Students & faculty"  to="/directory"/>
          </div>
        </section>

        {/* Notices */}
        <section className="card lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <div className="h-section">Notices</div>
            <button onClick={() => nav('/notices')} className="chip">View all</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {notices.length === 0 && <p className="text-sm opacity-60">No notices yet.</p>}
            {notices.slice(0, 3).map(n => (
              <div key={n.id} className="flex items-start gap-3 rounded-2xl p-3 bg-white/60 dark:bg-white/5 border border-white/60 dark:border-white/10">
                <Megaphone size={16} className="mt-1 text-ios-pink"/>
                <div className="min-w-0">
                  <div className="text-[11px] opacity-70 clip-1">{n.created_by_name || 'Faculty'} · {new Date(n.created_at).toLocaleDateString()}</div>
                  <div className="font-semibold text-sm clip-1">{n.title}</div>
                  <div className="text-xs opacity-80 clip-2">{n.body}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */
function BacklogsCard({ backlogs, pct, cgpa }: { backlogs: any[]; pct: number; cgpa: number }) {
  const bySem = new Map<number, any[]>();
  for (const b of backlogs) {
    if (!bySem.has(b.semester)) bySem.set(b.semester, []);
    bySem.get(b.semester)!.push(b);
  }
  // Personalised improvement tips
  const tips: string[] = [];
  if (backlogs.length >= 3) tips.push(`You have ${backlogs.length} backlogs — prioritize clearing them before your next semester.`);
  else tips.push(`You have ${backlogs.length} backlog${backlogs.length > 1 ? 's' : ''} — focus on ${backlogs[0]?.name} first.`);
  if (pct < 75) tips.push(`Your attendance is ${pct}%. Attend all upcoming classes — many colleges require 75% to sit exams.`);
  if (cgpa < 5) tips.push('Your CGPA is below 5.0. Consider evening study groups + one-on-one time with faculty.');
  if (backlogs.some(b => b.name?.toLowerCase().includes('math'))) tips.push('Mathematics is a common backlog — practice 30 min every day, past-paper style.');
  tips.push('Meet each subject teacher during office hours to plan your re-exam strategy.');

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl shadow-hi text-white overflow-hidden bg-gradient-to-r from-ios-red to-ios-pink">
      <div className="p-4 sm:p-5 flex items-start gap-3">
        <div className="h-11 w-11 rounded-2xl bg-white/20 grid place-items-center backdrop-blur shrink-0">
          <AlertTriangle size={22}/>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-90">Backlogs to clear</div>
          <div className="font-bold text-lg mt-0.5">
            {backlogs.length} subject{backlogs.length !== 1 ? 's' : ''} — you can still bounce back
          </div>
        </div>
      </div>

      {/* List of failed subjects */}
      <div className="px-4 sm:px-5 pb-3">
        <div className="rounded-2xl bg-white/10 backdrop-blur p-3 space-y-2 max-h-64 overflow-y-auto">
          {Array.from(bySem.entries()).sort((a,b) => a[0] - b[0]).map(([sem, list]) => (
            <div key={sem}>
              <div className="text-[10px] uppercase tracking-wider opacity-80 font-bold mb-1">
                Semester {['I','II','III','IV','V','VI'][sem-1] || sem}
              </div>
              <div className="space-y-1">
                {list.map(b => (
                  <div key={b.subject_id} className="flex items-center gap-2 text-sm min-w-0">
                    <span className="chip !text-white !bg-white/20 !border-white/20 !text-[10px]">F</span>
                    <span className="clip-1 flex-1">{b.name}</span>
                    <span className="tabular-nums font-semibold shrink-0">{b.total}/{b.max_total}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Improvement tips */}
      <div className="px-4 sm:px-5 pb-4 sm:pb-5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider opacity-90 mb-2">
          <Lightbulb size={12}/> How to improve
        </div>
        <ul className="space-y-1.5">
          {tips.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px] leading-snug">
              <Target size={13} className="mt-1 shrink-0 opacity-90"/> <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>
    </motion.section>
  );
}

function ClassCard({ label, slot, tone }: { label: string; slot: any; tone: string }) {
  return (
    <div className={`rounded-3xl p-4 text-white bg-gradient-to-r ${tone} shadow-hi`}>
      <div className="text-[11px] uppercase tracking-wider opacity-90 font-bold">{label}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-[16px] clip-1">{slot.subject_name || slot.subject_code || '—'}</div>
          <div className="text-xs opacity-90 mt-0.5 clip-1">
            {slot.teacher_name || '—'} · {slot.start_time.slice(0,5)} – {slot.end_time.slice(0,5)}
          </div>
        </div>
        {slot.room && (
          <span className="chip !text-white/95 bg-white/20 border-white/20 shrink-0">
            <MapPin size={12}/> {slot.room}
          </span>
        )}
      </div>
    </div>
  );
}

function ProgressChart({ results }: { results: { semester: number; sgpa: number | null; cgpa: number | null }[] }) {
  if (results.length === 0) {
    return <p className="text-sm opacity-60 text-center py-8">No semester results yet.</p>;
  }
  // Compute cumulative CGPA from SGPAs (average up to each sem)
  const labels = results.map(r => `Sem ${['I','II','III','IV','V','VI'][r.semester - 1] || r.semester}`);
  const sgpaData = results.map(r => Number(r.sgpa));
  const cumCGPA: number[] = [];
  let running = 0;
  results.forEach((r, i) => {
    running += Number(r.sgpa);
    cumCGPA.push(+(running / (i + 1)).toFixed(2));
  });

  return (
    <div className="h-56">
      <Line
        data={{
          labels,
          datasets: [
            {
              label: 'SGPA',
              data: sgpaData,
              borderColor: '#307DFF', backgroundColor: 'rgba(48,125,255,0.15)',
              borderWidth: 3, tension: 0.4, fill: true, pointRadius: 5, pointBackgroundColor: '#307DFF'
            },
            {
              label: 'CGPA (avg)',
              data: cumCGPA,
              borderColor: '#7F23FF', backgroundColor: 'rgba(127,35,255,0.10)',
              borderWidth: 3, tension: 0.4, fill: false, borderDash: [6, 4], pointRadius: 5, pointBackgroundColor: '#7F23FF'
            }
          ]
        }}
        options={{
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 10 } },
            tooltip: { intersect: false, mode: 'index' }
          },
          scales: {
            x: { grid: { display: false } },
            y: { min: 0, max: 10, ticks: { stepSize: 2 }, grid: { color: 'rgba(0,0,0,0.05)' } }
          }
        }}
      />
    </div>
  );
}

function StatMini({ label, value, tone, icon }: { label: string; value: string; tone: 'blue'|'purple'|'orange'; icon: React.ReactNode }) {
  const g = { blue: 'from-ios-blue to-ios-indigo', purple: 'from-ios-purple to-ios-pink', orange: 'from-ios-orange to-ios-red' }[tone];
  return (
    <div className="rounded-2xl p-3 text-white shadow-soft min-w-[110px]">
      <div className={`rounded-2xl p-3 bg-gradient-to-br ${g}`}>
        <div className="flex items-center gap-1 text-[11px] opacity-90">{icon}{label}</div>
        <div className="mt-1 text-xl font-bold tracking-tight">{value}</div>
      </div>
    </div>
  );
}
function Ring({ value }: { value: number }) {
  const size = 96; const stroke = 10; const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#307DFF"/><stop offset="1" stopColor="#7F23FF"/></linearGradient>
        </defs>
        <circle cx={size/2} cy={size/2} r={r} stroke="rgba(0,0,0,.08)" strokeWidth={stroke} fill="none"/>
        <motion.circle cx={size/2} cy={size/2} r={r} stroke="url(#rg)" strokeWidth={stroke} strokeLinecap="round" fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: off }}
          transition={{ duration: 1.2, ease: [0.2, 0.7, 0.2, 1] }}/>
      </svg>
      <div className="absolute inset-0 grid place-items-center text-lg font-bold">{value}%</div>
    </div>
  );
}
function RankCard({ label, rank, total, tone }: { label: string; rank: number; total: number; tone: 'blue'|'green'|'purple' }) {
  const g = { blue: 'from-ios-blue to-ios-teal', green: 'from-ios-green to-ios-teal', purple: 'from-ios-purple to-ios-pink' }[tone];
  return (
    <div className={`rounded-2xl p-3 text-white bg-gradient-to-br ${g}`}>
      <div className="text-[11px] opacity-90 clip-1">{label}</div>
      <div className="text-2xl font-bold tracking-tight">{total ? `#${rank}` : '—'}</div>
      {total > 0 && <div className="text-[11px] opacity-90">of {total}</div>}
    </div>
  );
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl p-3 bg-white/60 dark:bg-white/5 border border-white/60 dark:border-white/10">
      <div className="text-[11px] opacity-70">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
function Quick({ icon, title, desc, to }: { icon: React.ReactNode; title: string; desc: string; to: string }) {
  const nav = useNavigate();
  return (
    <button onClick={() => nav(to)}
      className="group text-left rounded-2xl p-4 bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 hover:shadow-card transition">
      <div className="flex items-start justify-between">
        <div className="h-9 w-9 rounded-xl grid place-items-center bg-gradient-to-br from-ios-blue to-ios-indigo text-white">{icon}</div>
        <ArrowUpRight size={16} className="opacity-40 group-hover:opacity-90 transition"/>
      </div>
      <div className="mt-3 font-semibold">{title}</div>
      <div className="text-xs opacity-60">{desc}</div>
    </button>
  );
}

function StaffWelcome({ name, role, notices }: { name: string; role: string; notices: any[] }) {
  return (
    <div className="space-y-6">
      <div className="card">
        <div className="h-section">{role.toUpperCase()} DASHBOARD</div>
        <div className="h-title mt-1">Welcome, {name || 'User'}</div>
        <p className="text-sm opacity-70 mt-1">
          {role === 'teacher' && "Manage today's classes, mark attendance, approve leave, post notices."}
          {role === 'admin'   && 'Manage students, teachers, timetables, notices, results and fee records.'}
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {role === 'teacher' && <>
          <Quick icon={<ClipboardCheck size={18}/>} title="Attendance" desc="Mark today"       to="/attendance"/>
          <Quick icon={<FileSignature size={18}/>}  title="Leave"      desc="Approve requests" to="/leave"/>
          <Quick icon={<Megaphone size={18}/>}      title="Notices"    desc="Post to students" to="/notices"/>
          <Quick icon={<CalendarClock size={18}/>}  title="Timetable"  desc="Weekly view"      to="/timetable"/>
        </>}
        {role === 'admin' && <>
          <Quick icon={<Users size={18}/>}          title="Students"   desc="Add · edit · archive" to="/admin/students"/>
          <Quick icon={<GraduationCap size={18}/>}  title="Teachers"   desc="Usernames · reset PW" to="/admin/teachers"/>
          <Quick icon={<CalendarClock size={18}/>}  title="Timetable"  desc="Upload / edit"        to="/admin/timetable"/>
          <Quick icon={<Upload size={18}/>}         title="Import"     desc="CSV / XLSX"           to="/import"/>
        </>}
      </div>
      {notices.length > 0 && (
        <div className="card">
          <div className="h-section mb-3">Recent notices</div>
          <div className="space-y-2">
            {notices.slice(0, 5).map((n: any) => (
              <div key={n.id} className="flex items-start gap-3 rounded-2xl p-3 bg-white/60 dark:bg-white/5 border border-white/60 dark:border-white/10">
                <Megaphone size={16} className="mt-1 text-ios-pink"/>
                <div className="min-w-0">
                  <div className="font-semibold text-sm clip-1">{n.title}</div>
                  <div className="text-xs opacity-70 clip-1">{n.created_by_name} · {new Date(n.created_at).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
