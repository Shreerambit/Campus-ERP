import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Plus, Search, Edit3, Archive, KeyRound, X, UserPlus,
  Camera, Save, Loader2, AlertCircle, CheckCircle2, RefreshCw
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useTenant } from '../lib/tenant';
import { useCollegeStudents, useAddStudent, useUpdateStudent, uploadStudentPhoto } from '../lib/liveData';
import { HAS_SUPABASE, supabase } from '../lib/supabase';
import type { Student } from '../lib/students';

export default function AdminStudents() {
  const { user } = useAuth();
  const { findCollege } = useTenant();
  const collegeId = user?.college_id;
  const college = collegeId ? findCollege(collegeId) : undefined;

  const [q, setQ] = useState('');
  const [section, setSection] = useState<string>('All');
  const [openStudent, setOpenStudent] = useState<Student | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: rows = [], isLoading, isError, error, refetch } = useCollegeStudents(collegeId);
  const sections = useMemo(() => Array.from(new Set(rows.map(r => r.section))).sort(), [rows]);
  const filtered = useMemo(() => {
    let arr = rows;
    if (section !== 'All') arr = arr.filter(s => s.section === section);
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      arr = arr.filter(s => s.name.toLowerCase().includes(t) || s.reg_no.toLowerCase().includes(t));
    }
    return arr;
  }, [rows, section, q]);

  if (!user || (user.role !== 'admin' && user.role !== 'super')) {
    return <div className="card"><div className="h-title">Access denied</div><p className="text-sm opacity-70 mt-1">Only College Admin and Super Admin can access student management.</p></div>;
  }

  return (
    <div className="space-y-4 min-w-0">
      <div className="card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-10 w-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-ios-blue to-ios-indigo shrink-0">
            <Users size={18}/>
          </div>
          <div className="flex-1 min-w-[160px] no-x">
            <div className="h-section">Student Management</div>
            <div className="h-title clip-1">{college?.short ?? 'Your college'} · {rows.length} students</div>
          </div>
          <button onClick={() => refetch()} className="chip" aria-label="Refresh"><RefreshCw size={12}/> Refresh</button>
          <button onClick={() => setCreating(true)} className="btn-primary"><UserPlus size={16}/> Add Student</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <select value={section} onChange={e => setSection(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 text-sm">
            <option>All sections</option>
            {sections.map(s => <option key={s} value={s}>Section {s}</option>)}
          </select>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 flex-1 min-w-[160px]">
            <Search size={14} className="opacity-60"/>
            <input placeholder="Search name or reg no…" value={q} onChange={e => setQ(e.target.value)}
              className="bg-transparent outline-none text-sm w-full"/>
          </div>
        </div>
        {!HAS_SUPABASE && (
          <div className="mt-3 rounded-2xl border border-ios-orange/30 bg-ios-orange/10 px-3 py-2 text-[12px] flex items-start gap-2 text-ios-orange">
            <AlertCircle size={14} className="mt-0.5 shrink-0"/> Supabase is not connected. Changes here won't persist. Add VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY to enable.
          </div>
        )}
      </div>

      {isLoading && <LoadingCard label="Loading students…"/>}
      {isError && <ErrorCard message={String((error as any)?.message || error)}/>}
      {!isLoading && !isError && filtered.length === 0 && <EmptyCard onCreate={() => setCreating(true)}/>}

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((s, i) => (
            <motion.button key={s.id} onClick={() => setOpenStudent(s)}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 12) * 0.02 }}
              className="card text-left !p-3 hover:shadow-hi transition min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                <img src={s.photo} className="h-11 w-11 rounded-2xl border border-white/60 bg-white shrink-0"/>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold clip-1">{s.name}</div>
                  <div className="text-[11px] opacity-60 clip-1">{s.reg_no} · Roll {s.short_roll}</div>
                </div>
                <span className="chip shrink-0">Sec {s.section}</span>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {creating && <StudentForm onClose={() => setCreating(false)}/>}
        {openStudent && !creating && (
          <StudentForm existing={openStudent} onClose={() => setOpenStudent(null)}/>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- Small state cards ---------- */
function LoadingCard({ label }: { label: string }) {
  return (
    <div className="card flex items-center gap-3">
      <Loader2 className="animate-spin text-ios-blue"/> <span className="text-sm opacity-80">{label}</span>
    </div>
  );
}
function ErrorCard({ message }: { message: string }) {
  return (
    <div className="card border-ios-red/30 bg-ios-red/10">
      <div className="flex items-start gap-2 text-ios-red">
        <AlertCircle size={16} className="mt-0.5"/>
        <div>
          <div className="font-semibold">Could not load students</div>
          <div className="text-sm opacity-80 mt-1">{message}</div>
        </div>
      </div>
    </div>
  );
}
function EmptyCard({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="card text-center py-8">
      <div className="mx-auto h-14 w-14 rounded-3xl grid place-items-center bg-gradient-to-br from-ios-blue to-ios-indigo text-white mb-3">
        <Plus size={24}/>
      </div>
      <div className="h-title">No students yet</div>
      <p className="text-sm opacity-70 mt-1 mb-4">Add students manually or use the Import Center to upload a CSV/XLSX.</p>
      <button onClick={onCreate} className="btn-primary"><UserPlus size={16}/> Add first student</button>
    </div>
  );
}

/* ============================================================
 *  Add / Edit sheet
 * ========================================================== */
function StudentForm({ existing, onClose }: { existing?: Student; onClose: () => void }) {
  const { user } = useAuth();
  const { findCollege } = useTenant();
  const college = user?.college_id ? findCollege(user.college_id) : undefined;
  const departments = college?.departments ?? [];

  const isEdit = !!existing;
  const [deptId, setDeptId] = useState<string>(existing?.department_id || departments[0]?.id || '');
  const dept = departments.find(d => d.id === deptId);
  const courses = dept?.courses ?? [];
  const [courseId, setCourseId] = useState<string>(existing?.course_id || courses[0]?.id || '');
  const course = courses.find(c => c.id === courseId);
  const sems = course?.semesters ?? [];
  const [semester, setSemester] = useState<number>(existing?.semester_number || sems[sems.length - 1]?.number || 1);
  const sem = sems.find(s => s.number === semester);
  const [section, setSection] = useState<string>(existing?.section || sem?.sections[0] || 'A');

  const [name, setName]     = useState(existing?.name || '');
  const [regNo, setRegNo]   = useState(existing?.reg_no || '');
  const [roll, setRoll]     = useState<number>(existing?.sl || 1);
  const [dob, setDob]       = useState(existing?.dob || '');
  const [gender, setGender] = useState<string>(existing?.gender || 'Male');
  const [email, setEmail]   = useState(existing?.personal_email || '');
  const [phone, setPhone]   = useState(existing?.phone || '');
  const [parentPhone, setParentPhone] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string>(existing?.photo || '');
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});

  const add = useAddStudent();
  const upd = useUpdateStudent();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg({});
    if (!user?.college_id) return setMsg({ err: 'No college in your session.' });
    if (!name.trim() || !regNo.trim()) return setMsg({ err: 'Name and Registration Number are required.' });

    setBusy(true);
    try {
      // Upload photo first if changed
      let uploadedPhoto = existing?.photo || photoUrl;
      if (photoFile) {
        uploadedPhoto = await uploadStudentPhoto(photoFile, user.college_id, regNo);
      }

      const payload: any = {
        college_id: user.college_id,
        department_id: deptId,
        course_id: courseId,
        semester, section,
        reg_no: regNo.trim().toUpperCase(),
        name: name.trim(),
        roll_number: roll || null,
        dob: dob || null,
        gender: gender || null,
        personal_email: email || null,
        phone: phone || null,
        parent_phone: parentPhone || null,
        parent_email: parentEmail || null,
        photo_url: uploadedPhoto || null
      };

      if (isEdit && HAS_SUPABASE && supabase) {
        // Look up the real DB id from reg_no+college
        const { data: row } = await supabase.from('students').select('id')
          .eq('college_id', user.college_id).eq('reg_no', existing!.reg_no).maybeSingle();
        if (row?.id) {
          await upd.mutateAsync({ id: row.id, patch: payload });
        } else {
          await add.mutateAsync(payload);
        }
      } else {
        await add.mutateAsync(payload);
      }

      setMsg({ ok: isEdit ? 'Student updated.' : `Student added. Default password = DOB (${dob || 'unset'}).` });
      setTimeout(() => onClose(), 900);
    } catch (err: any) {
      setMsg({ err: err?.message || String(err) });
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!existing || !HAS_SUPABASE || !supabase) return;
    if (!confirm(`Archive ${existing.name}?`)) return;
    setBusy(true);
    const { data: row } = await supabase.from('students').select('id')
      .eq('college_id', user!.college_id!).eq('reg_no', existing.reg_no).maybeSingle();
    if (row?.id) {
      await supabase.from('students').update({ status: 'archived' }).eq('id', row.id);
      setMsg({ ok: 'Archived.' });
      setTimeout(() => onClose(), 700);
    }
    setBusy(false);
  };

  const resetPassword = async () => {
    if (!existing || !HAS_SUPABASE || !supabase) return;
    // For real prod this must call an Edge Function with service_role.
    setMsg({ ok: 'Reset link generated (implement Edge Function to email/reset auth password).' });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-end md:place-items-center bg-black/40 backdrop-blur-sm p-3"
      onClick={onClose}
    >
      <motion.form
        onSubmit={submit}
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        onClick={e => e.stopPropagation()}
        className="w-full md:w-[640px] max-h-[90vh] overflow-y-auto rounded-4xl glass p-4 sm:p-5 shadow-hi"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="h-title clip-1">{isEdit ? 'Edit student' : 'Add new student'}</div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-full glass grid place-items-center ml-auto shrink-0"><X size={16}/></button>
        </div>

        {/* Photo */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative">
            <img src={photoUrl || `https://api.dicebear.com/9.x/notionists/svg?seed=${regNo || 'new'}`}
              className="h-16 w-16 rounded-2xl border border-white/60 bg-white"/>
            <label className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-ios-blue text-white grid place-items-center cursor-pointer shadow-hi">
              <Camera size={14}/>
              <input type="file" accept="image/*" className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]; if (!f) return;
                  setPhotoFile(f);
                  const r = new FileReader(); r.onload = () => setPhotoUrl(String(r.result)); r.readAsDataURL(f);
                }}/>
            </label>
          </div>
          <div className="text-xs opacity-70">JPG/PNG/WEBP · uploaded to Supabase Storage on save.</div>
        </div>

        {/* Section grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <T label="Full Name*" value={name} onChange={setName} placeholder="e.g. Shivanand R Kanni"/>
          <T label="Registration No*" value={regNo} onChange={v => setRegNo(v.toUpperCase())} placeholder="U26ZW24S0001" disabled={isEdit}/>
          <T label="Roll Number" value={String(roll)} onChange={v => setRoll(Number(v) || 0)} type="number"/>
          <T label="Date of Birth" value={dob} onChange={setDob} type="date"/>
          <Select label="Gender" value={gender} onChange={setGender} options={['Male','Female','Other']}/>
          <T label="Email" value={email} onChange={setEmail} type="email"/>
          <T label="Phone" value={phone} onChange={setPhone} type="tel"/>
          <T label="Parent Phone" value={parentPhone} onChange={setParentPhone} type="tel"/>
          <T label="Parent Email" value={parentEmail} onChange={setParentEmail} type="email"/>
        </div>

        <div className="mt-3 h-section">Academic placement</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
          <Select label="Department" value={deptId} onChange={setDeptId} options={departments.map(d => ({ v: d.id, l: d.code }))}/>
          <Select label="Course" value={courseId} onChange={setCourseId} options={courses.map(c => ({ v: c.id, l: c.code }))}/>
          <Select label="Semester" value={String(semester)} onChange={v => setSemester(Number(v))} options={sems.map(s => ({ v: String(s.number), l: `Sem ${s.label}` }))}/>
          <Select label="Section" value={section} onChange={setSection} options={(sem?.sections ?? ['A']).map(x => ({ v: x, l: `Sec ${x}` }))}/>
        </div>

        {msg.err && <div className="mt-4 rounded-2xl border border-ios-red/30 bg-ios-red/10 px-3 py-2 text-sm flex items-start gap-2 text-ios-red">
          <AlertCircle size={16} className="mt-0.5 shrink-0"/> {msg.err}
        </div>}
        {msg.ok && <div className="mt-4 rounded-2xl border border-ios-green/30 bg-ios-green/10 px-3 py-2 text-sm flex items-start gap-2 text-ios-green">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0"/> {msg.ok}
        </div>}

        <div className="mt-5 flex flex-wrap gap-2">
          {isEdit && (
            <>
              <button type="button" onClick={resetPassword} className="btn-ghost"><KeyRound size={14}/> Reset password</button>
              <button type="button" onClick={archive} className="btn-ghost !text-ios-orange"><Archive size={14}/> Archive</button>
            </>
          )}
          <button type="button" onClick={onClose} className="btn-ghost ml-auto">Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary disabled:opacity-60">
            {busy ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}
            {isEdit ? 'Save changes' : 'Add student'}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}

function T({ label, value, onChange, placeholder, type = 'text', disabled }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; disabled?: boolean;
}) {
  return (
    <div className="min-w-0">
      <label className="text-[11px] uppercase tracking-wider opacity-60 font-semibold">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} disabled={disabled}
        className="mt-1 w-full rounded-xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ios-blue/40 disabled:opacity-60"/>
    </div>
  );
}
function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: (string | { v: string; l: string })[];
}) {
  return (
    <div className="min-w-0">
      <label className="text-[11px] uppercase tracking-wider opacity-60 font-semibold">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ios-blue/40">
        {options.map(o => typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}
