import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Github, Linkedin, Mail, Phone, Award, Code2, Trophy, Lock, Camera, Save, ShieldCheck, KeyRound, LogOut, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { uploadStudentPhoto } from '../lib/liveData';

export default function Profile() {
  const nav = useNavigate();
  const { user, updateProfile, changePassword, logout } = useAuth();

  const s = user?.student;
  const [photo, setPhoto] = useState(user?.photo || s?.photo || '');
  const [email, setEmail] = useState(user?.email || '');
  const [emergency, setEmergency] = useState(user?.emergencyContact || s?.emergency_contact || '');
  const [savedFlash, setSavedFlash] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [pwdMsg, setPwdMsg] = useState<{ ok?: string; err?: string }>({});

  const handlePhotoUpload = async (file: File) => {
    if (!s || !user?.college_id) return;
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image is too large. Please choose one under 5 MB.');
      return;
    }
    setUploadError(null);
    setUploading(true);
    // Optimistic preview
    const preview = URL.createObjectURL(file);
    setPhoto(preview);
    try {
      const url = await uploadStudentPhoto(file, user.college_id, s.reg_no);
      setPhoto(url);
      await updateProfile({ photo: url });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e: any) {
      setUploadError(e?.message || 'Photo upload failed. Please try again.');
      setPhoto(user?.photo || s?.photo || '');   // rollback
    } finally {
      setUploading(false);
    }
  };

  const saveEditable = () => {
    updateProfile({ photo, email, emergencyContact: emergency });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const submitPwd = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg({});
    if (pwd.next !== pwd.confirm) return setPwdMsg({ err: 'New password and confirmation do not match.' });
    const res = await changePassword(pwd.current, pwd.next);
    if (!res.ok) return setPwdMsg({ err: res.error });
    setPwd({ current: '', next: '', confirm: '' });
    setPwdMsg({ ok: 'Password updated successfully.' });
  };

  if (!s) {
    return (
      <div className="card">
        <div className="h-title">Profile</div>
        <p className="opacity-70 mt-2 text-sm">Only student profiles are shown here in this demo. Signed in as {user?.displayName}.</p>
        <button onClick={() => { logout(); nav('/welcome'); }} className="btn-ghost mt-4"><LogOut size={16}/> Log out</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div layout className="card relative overflow-hidden">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-30"
             style={{ background: 'radial-gradient(closest-side, rgba(10,132,255,.5), transparent)' }} />
        <div className="relative flex flex-col md:flex-row md:items-center gap-5">
          <div className="flex flex-col items-center md:items-start">
            <label className="relative cursor-pointer group" title="Tap to change your profile photo">
              <img src={photo} alt="Profile"
                   className="h-28 w-28 rounded-3xl border border-white/70 shadow-soft bg-white object-cover
                              transition group-hover:brightness-90"/>
              {uploading ? (
                <div className="absolute inset-0 rounded-3xl grid place-items-center bg-black/50 text-white">
                  <Loader2 className="animate-spin" size={26}/>
                </div>
              ) : (
                <div className="absolute inset-0 rounded-3xl grid place-items-center bg-black/0 group-hover:bg-black/30 transition">
                  <Camera size={22} className="text-white opacity-0 group-hover:opacity-100 transition"/>
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 h-9 w-9 rounded-full bg-ios-blue text-white grid place-items-center shadow-hi ring-2 ring-white dark:ring-black">
                <Camera size={15}/>
              </div>
              <input type="file" accept="image/*" className="hidden" disabled={uploading}
                onChange={e => {
                  const f = e.target.files?.[0]; if (!f) return;
                  handlePhotoUpload(f);
                  e.target.value = '';
                }}/>
            </label>
            <button
              type="button"
              onClick={() => (document.querySelector('label > input[type=file]') as HTMLInputElement | null)?.click()}
              className="mt-2 text-xs font-semibold text-ios-blue hover:underline">
              {uploading ? 'Uploading…' : 'Change photo'}
            </button>
          </div>
          <div className="flex-1 min-w-0">
            <div className="h-display truncate">{s.name}</div>
            <div className="opacity-70 text-sm">{s.reg_no} · {s.course} · Sem {s.semester} · Section {s.section}</div>
            <div className="text-xs opacity-60 mt-0.5">Campus ERP · Multi-college platform</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="chip"><Mail size={12}/> {email || s.personal_email}</span>
              <span className="chip"><Phone size={12}/> {emergency || s.phone}</span>
              <span className="chip"><Github size={12}/> github.com/{s.reg_no.toLowerCase()}</span>
              <span className="chip"><Linkedin size={12}/> linkedin.com/in/{s.reg_no.toLowerCase()}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Metric label="CGPA"       value={s.cgpa.toFixed(2)}       tone="from-ios-purple to-ios-pink"/>
            <Metric label="SGPA"       value={s.sgpa.toFixed(2)}       tone="from-ios-teal to-ios-blue"/>
            <Metric label="Attendance" value={`${s.attendance_pct}%`}  tone="from-ios-blue to-ios-indigo"/>
          </div>
        </div>
      </motion.div>

      {/* Admin-managed (read-only) */}
      <section className="card">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={16}/> <div className="h-title">Official Details</div>
          <span className="chip ml-auto"><Lock size={12}/> Editable by Admin only</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <ReadonlyField label="Full Name"           value={s.name}/>
          <ReadonlyField label="Registration No"     value={s.reg_no}/>
          <ReadonlyField label="Roll Number"         value={s.short_roll}/>
          <ReadonlyField label="Department"          value={s.department}/>
          <ReadonlyField label="Course"              value={s.course}/>
          <ReadonlyField label="Semester"            value={s.semester}/>
          <ReadonlyField label="Section"             value={s.section}/>
          <ReadonlyField label="Batch"               value={s.batch_no || '—'}/>
          <ReadonlyField label="Date of Birth"       value={new Date(s.dob).toLocaleDateString()}/>
          <ReadonlyField label="Admission Year"      value={String(s.admission_year)}/>
          <ReadonlyField label="Academic Year"       value={s.academic_year}/>
          <ReadonlyField label="Gender"              value={s.gender}/>
        </div>
      </section>

      {/* Editable */}
      <section className="card">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-title">Personal Information</div>
          <span className="chip ml-auto text-ios-blue">Editable by you</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <EditableField label="Personal Email"    value={email}     onChange={setEmail}    placeholder="you@example.com" type="email"/>
          <EditableField label="Emergency Contact" value={emergency} onChange={setEmergency} placeholder="+91 …" type="tel"/>
          <div>
            <div className="text-[11px] uppercase tracking-wider font-semibold opacity-60 mb-1">Profile Photo</div>
            <div className="rounded-xl bg-white/60 dark:bg-white/5 border border-white/60 dark:border-white/10 px-3 py-3 text-sm flex items-center gap-3">
              <img src={photo} className="h-10 w-10 rounded-xl border border-white/60 bg-white"/>
              <span className="opacity-70 text-xs">Use the camera badge on your photo above to upload a new one.</span>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button onClick={saveEditable} className="btn-primary"><Save size={16}/> Save changes</button>
          {savedFlash && <span className="chip text-ios-green"><CheckCircle2 size={12}/> Saved</span>}
          {uploadError && (
            <span className="chip text-ios-red"><AlertCircle size={12}/> {uploadError}</span>
          )}
        </div>
      </section>

      {/* Change password */}
      <section className="card">
        <div className="flex items-center gap-2 mb-3">
          <KeyRound size={16}/> <div className="h-title">Change Password</div>
        </div>
        <form onSubmit={submitPwd} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <PwdField label="Current" value={pwd.current} onChange={v => setPwd(p => ({ ...p, current: v }))}/>
          <PwdField label="New"     value={pwd.next}    onChange={v => setPwd(p => ({ ...p, next: v }))}/>
          <PwdField label="Confirm" value={pwd.confirm} onChange={v => setPwd(p => ({ ...p, confirm: v }))}/>
          {pwdMsg.err && (
            <div className="md:col-span-3 rounded-2xl border border-ios-red/30 bg-ios-red/10 px-3 py-2.5 text-sm flex items-start gap-2 text-ios-red">
              <AlertCircle size={16} className="mt-0.5 shrink-0"/> {pwdMsg.err}
            </div>
          )}
          {pwdMsg.ok && (
            <div className="md:col-span-3 rounded-2xl border border-ios-green/30 bg-ios-green/10 px-3 py-2.5 text-sm flex items-start gap-2 text-ios-green">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0"/> {pwdMsg.ok}
            </div>
          )}
          <div className="md:col-span-3"><button className="btn-primary">Update password</button></div>
        </form>
      </section>

      {/* Public sections */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SectionCard title="Skills" icon={<Code2 size={16}/>}>
          <div className="flex flex-wrap gap-2">{s.skills.map(t => <span key={t} className="chip">{t}</span>)}</div>
        </SectionCard>
        <SectionCard title="Achievements" icon={<Trophy size={16}/>}>
          <ul className="space-y-2 text-sm">{s.achievements.map(a => <li key={a}>🏆 {a}</li>)}</ul>
        </SectionCard>
        <SectionCard title="Badges" icon={<Award size={16}/>}>
          <div className="flex flex-wrap gap-2">{s.badges.map(b => <span key={b} className="chip">{b}</span>)}</div>
        </SectionCard>
      </div>

      <button onClick={() => { logout(); nav('/welcome'); }} className="btn-ghost">
        <LogOut size={16}/> Sign out
      </button>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`rounded-2xl p-3 text-white bg-gradient-to-br ${tone}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-90">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-semibold opacity-60 mb-1">{label}</div>
      <div className="rounded-xl bg-white/60 dark:bg-white/5 border border-white/60 dark:border-white/10 px-3 py-2 text-sm flex items-center gap-2">
        <Lock size={12} className="opacity-60"/> {value}
      </div>
    </div>
  );
}
function EditableField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-semibold opacity-60 mb-1">{label}</div>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ios-blue/40"/>
    </div>
  );
}
function PwdField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-semibold opacity-60 mb-1">{label}</div>
      <input type="password" value={value} onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ios-blue/40" required />
    </div>
  );
}
function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">{icon}<div className="h-title">{title}</div></div>
      {children}
    </div>
  );
}
