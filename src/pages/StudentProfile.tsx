/**
 * Public academic profile of ANY student, viewable by anyone logged
 * into the same college. Absolutely no private data (phone, email,
 * address, password, DOB) is displayed.
 *
 * Route: /students/:regNo
 */
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, GraduationCap, Trophy, ClipboardCheck, Layers, Loader2, AlertCircle
} from 'lucide-react';
import { useMemo } from 'react';
import { useAuth } from '../lib/auth';
import { fetchStudentByReg } from '../lib/db';
import { dbToStudent, useStudentAcademics, useStudentAttendance, useCollegeStudentsWithAttendance } from '../lib/liveData';
import { useQuery } from '@tanstack/react-query';

export default function StudentProfile() {
  const { regNo = '' } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();

  const { data: student, isLoading, isError, error } = useQuery({
    queryKey: ['public-student', user?.college_id, regNo],
    enabled: !!user?.college_id && !!regNo,
    queryFn: async () => {
      const row = await fetchStudentByReg(user!.college_id!, regNo);
      return row ? dbToStudent(row) : null;
    }
  });

  const { data: acad } = useStudentAcademics(student?.db_id, student?.college_id);
  const { data: att }  = useStudentAttendance(student?.db_id);
  const { data: allStudents = [] } = useCollegeStudentsWithAttendance(user?.college_id);

  // Ranks computed live from the same roster used everywhere else.
  const ranks = useMemo(() => {
    if (!student || allStudents.length === 0) return null;
    const cgpaSorted = [...allStudents].sort((a, b) => b.cgpa - a.cgpa);
    const attSorted  = [...allStudents].sort((a, b) => b.attendance_pct - a.attendance_pct);
    const sectionArr = allStudents.filter(s => s.section === student.section && s.section);
    const secSorted  = [...sectionArr].sort((a, b) => b.cgpa - a.cgpa);
    return {
      overall:     { rank: cgpaSorted.findIndex(x => x.id === student.id) + 1, total: cgpaSorted.length },
      attendance:  { rank: attSorted.findIndex(x => x.id === student.id) + 1,  total: attSorted.length  },
      sectionRank: { rank: secSorted.findIndex(x => x.id === student.id) + 1,  total: secSorted.length  }
    };
  }, [student, allStudents]);

  if (isLoading) return <div className="card flex items-center gap-2"><Loader2 className="animate-spin"/> Loading profile…</div>;
  if (isError)   return <div className="card border-ios-red/30 bg-ios-red/10 text-ios-red text-sm"><AlertCircle size={14} className="inline mr-1"/> {String((error as any)?.message || error)}</div>;
  if (!student)  return <div className="card text-center"><div className="h-title">Student not found</div><p className="text-sm opacity-70 mt-1">Registration number {regNo} isn't in this college.</p></div>;

  // Live CGPA = avg of SGPAs
  const semResults = (acad?.results || []).filter(r => r.sgpa != null).sort((a, b) => a.semester - b.semester);
  const trueCGPA = semResults.length
    ? +(semResults.reduce((a, r) => a + Number(r.sgpa), 0) / semResults.length).toFixed(2)
    : student.cgpa;
  const latestSGPA = semResults.length ? Number(semResults[semResults.length - 1].sgpa) : null;

  const pct = att?.pct ?? 0;
  const subjects = (acad?.subjects || []).filter(s => s.semester === student.semester_number);

  return (
    <div className="space-y-4 min-w-0">
      <button onClick={() => nav(-1)} className="chip"><ArrowLeft size={14}/> Back</button>

      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="card">
        <div className="flex items-start gap-3 sm:gap-4">
          <img src={student.photo}
               className="h-16 w-16 sm:h-20 sm:w-20 rounded-3xl border border-white/60 bg-white shrink-0 object-cover"/>
          <div className="flex-1 min-w-0">
            <div className="h-title clip-1">{student.name}</div>
            <div className="text-sm opacity-70 clip-1">{student.reg_no} · Roll {student.short_roll}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="chip">{student.department}</span>
              <span className="chip">{student.course}</span>
              <span className="chip">Sem {student.semester}</span>
              <span className="chip">Sec {student.section}</span>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Attendance" value={`${pct}%`} tone="from-ios-blue to-ios-indigo" icon={<ClipboardCheck size={14}/>} />
        <Stat label="Latest SGPA" value={latestSGPA ? latestSGPA.toFixed(2) : '—'} tone="from-ios-teal to-ios-blue" icon={<Layers size={14}/>} />
        <Stat label="Overall CGPA" value={trueCGPA ? trueCGPA.toFixed(2) : '—'} tone="from-ios-purple to-ios-pink" icon={<GraduationCap size={14}/>} />
        <Stat label="Overall Rank" value={ranks?.overall?.rank ? `#${ranks.overall.rank}` : '—'} tone="from-ios-orange to-ios-red" icon={<Trophy size={14}/>} />
      </div>

      {semResults.length > 0 && (
        <div className="card">
          <div className="h-section mb-3">Semester-wise SGPA</div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {semResults.map(r => (
              <div key={r.id} className="rounded-2xl p-2 bg-white/60 dark:bg-white/5 border border-white/60 dark:border-white/10 text-center">
                <div className="text-[9px] uppercase tracking-wider opacity-60 font-semibold">Sem {['I','II','III','IV','V','VI'][r.semester-1] || r.semester}</div>
                <div className="text-sm font-bold tabular-nums mt-0.5">{r.sgpa ? Number(r.sgpa).toFixed(2) : '—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {subjects.length > 0 && (
        <div className="card">
          <div className="h-section mb-3">Current semester subjects</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {subjects.map(s => (
              <div key={s.subject_id} className="rounded-2xl p-3 bg-white/60 dark:bg-white/5 border border-white/60 dark:border-white/10">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="text-xs opacity-60">{s.code}</div>
                    <div className="font-semibold clip-2">{s.name}</div>
                  </div>
                  <span className={`chip shrink-0 ${s.grade === 'F' ? 'text-ios-red' : 'text-ios-green'}`}>{s.grade}</span>
                </div>
                <div className="mt-2 flex gap-2 text-[11px] opacity-70">
                  <span>CIA {s.cia ?? '—'}/{s.cia_max}</span>
                  <span>SEE {s.see ?? '—'}/{s.see_max}</span>
                  <span className="ml-auto tabular-nums font-semibold">{s.percentage}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {student.achievements?.length > 0 && (
        <div className="card">
          <div className="h-section mb-2">Achievements</div>
          <div className="flex flex-wrap gap-1.5">
            {student.achievements.map((a, i) => <span key={i} className="chip">🏆 {a}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, icon }: { label: string; value: string; tone: string; icon: React.ReactNode }) {
  return (
    <div className={`rounded-2xl p-3 text-white bg-gradient-to-br ${tone}`}>
      <div className="text-[10px] opacity-90 uppercase tracking-wider flex items-center gap-1">{icon} {label}</div>
      <div className="text-lg font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
