import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CalendarDays, FileSignature, Send, CheckCircle2, Clock, XCircle,
  User, Lock, MessageSquare, Loader2, AlertCircle
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useTeachers, useMyLeaves, useCollegeLeaves, useCreateLeave, useDecideLeave, LeaveApp } from '../lib/liveData';

export default function Leave() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === 'teacher' || user.role === 'admin' || user.role === 'super') return <TeacherView/>;
  return <StudentView/>;
}

/* ============================================================
 *  STUDENT
 * ========================================================== */
function StudentView() {
  const { user } = useAuth();
  const s = user!.student;
  const { data: teachers = [] } = useTeachers(user!.college_id);
  const { data: history = [] } = useMyLeaves(s?.db_id);
  const { mutateAsync, isPending } = useCreateLeave();

  const [type, setType] = useState('Medical');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [subj, setSubj] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});

  if (!s?.db_id) {
    return <div className="card"><div className="h-title">Not found</div><p className="text-sm opacity-70 mt-1">Your student record could not be loaded from the database.</p></div>;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg({});
    try {
      await mutateAsync({
        college_id: user!.college_id!,
        student_id: s.db_id!,
        subject: subj || `${type} leave`,
        reason,
        leave_type: type,
        from_date: from,
        to_date: to,
        status: 'pending' as any
      });
      setMsg({ ok: 'Application submitted.' });
      setSubj(''); setReason(''); setFrom(''); setTo('');
    } catch (e: any) {
      setMsg({ err: e?.message || String(e) });
    }
  };

  return (
    <div className="space-y-6 min-w-0">
      <Header/>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <form onSubmit={submit} className="card lg:col-span-3 space-y-4 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ReadRow label="Student Name"      value={s.name}/>
            <ReadRow label="Registration No"   value={s.reg_no}/>
            <ReadRow label="Roll Number"       value={s.short_roll}/>
            <ReadRow label="Department"        value={s.department}/>
            <ReadRow label="Course"            value={s.course}/>
            <ReadRow label="Semester"          value={s.semester}/>
            <ReadRow label="Section"           value={s.section}/>
          </div>

          <Field label="To (Class Teacher)">
            <div className="flex items-center gap-2 rounded-2xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-white/5 px-3 py-2.5">
              <User size={14} className="opacity-60 shrink-0"/>
              <select value={teacherId} onChange={e => setTeacherId(e.target.value)}
                className="w-full bg-transparent outline-none text-sm">
                <option value="">Select teacher…</option>
                {teachers.filter(t => t.status === 'active').map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.assigned_subjects?.length ? ` — ${t.assigned_subjects.join(', ')}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </Field>

          <Field label="Subject">
            <input value={subj} onChange={e => setSubj(e.target.value)} placeholder="e.g. Medical leave" className="w-full input"/>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Leave Type">
              <select value={type} onChange={e => setType(e.target.value)} className="w-full input">
                <option>Medical</option><option>Casual</option><option>Event</option><option>Other</option>
              </select>
            </Field>
            <Field label="From">
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} required className="w-full input"/>
            </Field>
            <Field label="To">
              <input type="date" value={to} onChange={e => setTo(e.target.value)} required className="w-full input"/>
            </Field>
          </div>

          <Field label="Reason">
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} required
              placeholder="Explain your reason briefly…" className="w-full input"/>
          </Field>

          {msg.err && <div className="rounded-2xl border border-ios-red/30 bg-ios-red/10 px-3 py-2 text-sm flex items-start gap-2 text-ios-red">
            <AlertCircle size={16} className="mt-0.5 shrink-0"/> {msg.err}
          </div>}
          {msg.ok && <div className="rounded-2xl border border-ios-green/30 bg-ios-green/10 px-3 py-2 text-sm flex items-start gap-2 text-ios-green">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0"/> {msg.ok}
          </div>}

          <button type="submit" disabled={isPending} className="btn-primary disabled:opacity-60">
            {isPending ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>} Submit application
          </button>
        </form>

        <div className="card lg:col-span-2 min-w-0">
          <div className="h-section mb-3">Your leave history</div>
          <div className="space-y-2">
            {history.length === 0 && <p className="text-sm opacity-60">No applications yet.</p>}
            {history.map(h => <HistoryItem key={h.id} h={h}/>)}
          </div>
        </div>
      </div>

      <style>{`.input{padding:.55rem .7rem;border-radius:.9rem;background:rgba(255,255,255,.7);border:1px solid rgba(255,255,255,.6);font-size:14px;outline:none;width:100%}
        html.dark .input{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.1);color:#fff}`}</style>
    </div>
  );
}

/* ============================================================
 *  TEACHER
 * ========================================================== */
function TeacherView() {
  const { user } = useAuth();
  const { data: all = [], isLoading, isError, error } = useCollegeLeaves(user!.college_id);
  const { mutateAsync } = useDecideLeave();
  const pending = useMemo(() => all.filter(x => x.status === 'pending'), [all]);

  return (
    <div className="space-y-6 min-w-0">
      <Header teacher/>

      {isLoading && <div className="card flex items-center gap-2"><Loader2 className="animate-spin"/> Loading requests…</div>}
      {isError && <div className="card border-ios-red/30 bg-ios-red/10 text-ios-red text-sm">
        <AlertCircle size={14} className="inline mr-1"/> {String((error as any)?.message || error)}
      </div>}

      <div className="card">
        <div className="h-section mb-3">Pending requests ({pending.length})</div>
        {pending.length === 0
          ? <p className="text-sm opacity-60">No pending requests.</p>
          : <div className="space-y-3">
              {pending.map(h => (
                <ApprovalCard key={h.id} h={h}
                  onDecide={(status, note) => mutateAsync({ id: h.id, status, note })}/>
              ))}
            </div>}
      </div>

      <div className="card">
        <div className="h-section mb-3">All requests ({all.length})</div>
        <div className="space-y-2">
          {all.map(h => <HistoryItem key={h.id} h={h} showStudent/>)}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 *  Shared UI
 * ========================================================== */
function Header({ teacher = false }: { teacher?: boolean }) {
  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-ios-green to-ios-teal shrink-0">
          <FileSignature size={18}/>
        </div>
        <div className="min-w-0">
          <div className="h-section">Leave Management</div>
          <div className="h-title truncate">
            {teacher ? 'Approve or reject student leave requests' : 'Apply and track your leave applications'}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider font-semibold opacity-60 mb-1">{label}</div>
      <div className="rounded-xl bg-white/60 dark:bg-white/5 border border-white/60 dark:border-white/10 px-3 py-2 text-sm flex items-center gap-2 clip-1">
        <Lock size={12} className="opacity-60 shrink-0"/> <span className="clip-1">{value}</span>
      </div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider font-semibold opacity-60 mb-1">{label}</div>
      {children}
    </div>
  );
}

function HistoryItem({ h, showStudent }: { h: LeaveApp & { student?: any }; showStudent?: boolean }) {
  const tone = h.status === 'approved' ? 'text-ios-green' : h.status === 'rejected' ? 'text-ios-red' : 'text-ios-orange';
  const Icon = h.status === 'approved' ? CheckCircle2 : h.status === 'rejected' ? XCircle : Clock;
  return (
    <div className="rounded-2xl p-3 bg-white/60 dark:bg-white/5 border border-white/60 dark:border-white/10">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium clip-1">{h.subject}</div>
        <span className={`chip ${tone}`}><Icon size={12}/> {h.status}</span>
      </div>
      {showStudent && h.student && (
        <div className="text-[11px] opacity-70 mt-0.5">
          {h.student.name} · {h.student.reg_no}
        </div>
      )}
      <div className="text-[11px] opacity-70 mt-0.5 flex flex-wrap items-center gap-x-2">
        <span><CalendarDays size={10} className="inline"/> {h.from_date} → {h.to_date}</span>
      </div>
      {h.teacher_note && (
        <div className="mt-2 text-[12px] opacity-80 flex items-start gap-1.5">
          <MessageSquare size={12} className="mt-0.5 opacity-60"/> {h.teacher_note}
        </div>
      )}
    </div>
  );
}

function ApprovalCard({ h, onDecide }: {
  h: LeaveApp & { student?: any };
  onDecide: (s: 'approved' | 'rejected', note?: string) => Promise<any>;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (status: 'approved' | 'rejected') => {
    setBusy(true);
    try { await onDecide(status, note.trim() || undefined); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-2xl p-3 sm:p-4 bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-semibold clip-1">{h.student?.name || 'Student'} <span className="opacity-60 text-xs">({h.student?.reg_no || '—'})</span></div>
          <div className="text-[11px] opacity-70">Section {h.student?.section || '—'} · Roll {h.student?.reg_no ? String(h.student.reg_no).slice(-3) : '—'}</div>
        </div>
        <span className="chip">{h.leave_type}</span>
      </div>
      <div className="text-sm font-medium">{h.subject}</div>
      <div className="text-[11px] opacity-70 mt-0.5 flex items-center gap-2">
        <CalendarDays size={12}/> {h.from_date} → {h.to_date}
      </div>
      <div className="mt-2 text-sm opacity-90 whitespace-pre-wrap">{h.reason}</div>

      <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
        placeholder="Optional comment for the student…"
        className="mt-3 w-full px-3 py-2 rounded-xl bg-white/60 dark:bg-white/5 border border-white/60 dark:border-white/10 text-sm outline-none"/>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => act('approved')} disabled={busy} className="btn-success disabled:opacity-60">
          <CheckCircle2 size={14}/> Approve
        </button>
        <button onClick={() => act('rejected')} disabled={busy} className="btn-danger disabled:opacity-60">
          <XCircle size={14}/> Reject
        </button>
      </div>
    </div>
  );
}
