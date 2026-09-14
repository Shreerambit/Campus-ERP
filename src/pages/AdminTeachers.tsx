import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Plus, Search, X, UserPlus, Camera, Save, Loader2, AlertCircle,
  CheckCircle2, RefreshCw, KeyRound, Power, Archive, Edit3, Copy
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useTenant } from '../lib/tenant';
import { HAS_SUPABASE, supabase } from '../lib/supabase';

type Teacher = {
  id: string;
  auth_user_id: string | null;
  college_id: string;
  department_id: string | null;
  emp_id: string;
  username: string;
  name: string;
  email: string | null;
  phone?: string | null;
  photo_url?: string | null;
  password_changed: boolean;
  status: 'active' | 'inactive' | 'archived';
  assigned_courses?: string[] | null;
  assigned_semesters?: number[] | null;
  assigned_sections?: string[] | null;
  assigned_subjects?: string[] | null;
};

const teacherEmailFor = (username: string, collegeId: string) =>
  `${username.toLowerCase()}@${collegeId}.teacher.local`;
const defaultPasswordFor = (username: string) => `teacher${username.toLowerCase()}`;
const usernameFromName = (name: string) =>
  name.trim().toLowerCase().split(/\s+/).pop()!.replace(/[^a-z0-9]/g, '');

export default function AdminTeachers() {
  const { user } = useAuth();
  const { findCollege } = useTenant();
  const college = user?.college_id ? findCollege(user.college_id) : undefined;

  const [rows, setRows] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);

  const load = async () => {
    if (!HAS_SUPABASE || !supabase || !user?.college_id) return;
    setLoading(true); setErr(null);
    try {
      const { data, error } = await supabase.from('teachers')
        .select('*').eq('college_id', user.college_id).order('name');
      if (error) throw error;
      setRows((data || []) as Teacher[]);
    } catch (e: any) { setErr(e?.message || String(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [user?.college_id]);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const t = q.trim().toLowerCase();
    return rows.filter(r => r.name.toLowerCase().includes(t) || r.username.toLowerCase().includes(t));
  }, [rows, q]);

  if (!user || (user.role !== 'admin' && user.role !== 'super')) {
    return <div className="card"><div className="h-title">Access denied</div><p className="text-sm opacity-70 mt-1">Only College Admin or Super Admin can manage teachers.</p></div>;
  }

  return (
    <div className="space-y-4 min-w-0">
      <div className="card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-10 w-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-ios-purple to-ios-pink shrink-0">
            <Users size={18}/>
          </div>
          <div className="flex-1 min-w-[160px] no-x">
            <div className="h-section">Teacher Management</div>
            <div className="h-title clip-1">{college?.short ?? 'Your college'} · {rows.length} teachers</div>
          </div>
          <button onClick={load} className="chip" aria-label="Refresh"><RefreshCw size={12}/> Refresh</button>
          <button onClick={() => setCreating(true)} className="btn-primary"><UserPlus size={16}/> Add Teacher</button>
        </div>
        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10">
          <Search size={14} className="opacity-60"/>
          <input placeholder="Search by name or username…" value={q} onChange={e => setQ(e.target.value)}
            className="bg-transparent outline-none text-sm w-full"/>
        </div>
        {!HAS_SUPABASE && (
          <div className="mt-3 rounded-2xl border border-ios-orange/30 bg-ios-orange/10 px-3 py-2 text-[12px] flex items-start gap-2 text-ios-orange">
            <AlertCircle size={14} className="mt-0.5 shrink-0"/> Supabase is not connected. Add VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY to enable teacher management.
          </div>
        )}
      </div>

      {loading && <div className="card flex items-center gap-2"><Loader2 className="animate-spin"/> Loading teachers…</div>}
      {err && <div className="card border-ios-red/30 bg-ios-red/10 text-ios-red text-sm"><AlertCircle size={14} className="inline mr-1"/> {err}</div>}
      {!loading && !err && rows.length === 0 && (
        <div className="card text-center py-8">
          <div className="mx-auto h-14 w-14 rounded-3xl grid place-items-center bg-gradient-to-br from-ios-purple to-ios-pink text-white mb-3">
            <Plus size={24}/>
          </div>
          <div className="h-title">No teachers yet</div>
          <p className="text-sm opacity-70 mt-1 mb-4">Add your first teacher below.</p>
          <button onClick={() => setCreating(true)} className="btn-primary"><UserPlus size={16}/> Add teacher</button>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((t, i) => (
            <motion.div key={t.id}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 10) * 0.02 }}
              className="card !p-3 min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                {t.photo_url
                  ? <img src={t.photo_url} className="h-11 w-11 rounded-2xl border border-white/60 bg-white shrink-0"/>
                  : <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-ios-purple to-ios-pink text-white grid place-items-center font-bold shrink-0">
                      {t.name.split(' ').pop()?.[0] ?? '?'}
                    </div>}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold clip-1">{t.name}</div>
                  <div className="text-[11px] opacity-60 clip-1">@{t.username} · {t.emp_id}</div>
                </div>
                <span className={`chip shrink-0 ${
                  t.status === 'active' ? 'text-ios-green' :
                  t.status === 'inactive' ? 'text-ios-orange' : 'text-ios-red'}`}>
                  ● {t.status}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(t.assigned_subjects || []).map(s => (
                  <span key={s} className="chip !text-[10px]">{s}</span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button onClick={() => setEditing(t)} className="chip"><Edit3 size={12}/> Edit</button>
                <button onClick={() => resetPassword(t, load)} className="chip"><KeyRound size={12}/> Reset PW</button>
                <button onClick={() => toggleStatus(t, load)} className="chip !text-ios-orange">
                  <Power size={12}/> {t.status === 'active' ? 'Deactivate' : 'Activate'}
                </button>
                <button onClick={() => archive(t, load)} className="chip !text-ios-red"><Archive size={12}/> Archive</button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {creating && <TeacherForm onClose={() => { setCreating(false); load(); }}/>}
        {editing && !creating && <TeacherForm existing={editing} onClose={() => { setEditing(null); load(); }}/>}
      </AnimatePresence>
    </div>
  );
}

/* ---------- Row actions ---------- */
async function resetPassword(t: Teacher, refresh: () => void) {
  const newPwd = prompt(`Reset password for ${t.name} (@${t.username}) to:`, defaultPasswordFor(t.username));
  if (!newPwd) return;
  alert(
    'Password reset must be done from Supabase Dashboard → Authentication → Users:\n\n' +
    `1. Find user with email:\n   ${teacherEmailFor(t.username, t.college_id)}\n` +
    `2. Click "..." → Reset password → set to: ${newPwd}\n` +
    '3. Come back here — teacher will be asked to change it on next login.\n\n' +
    'For a fully automatic flow, deploy a Supabase Edge Function that calls auth.admin.updateUserById.'
  );
  if (HAS_SUPABASE && supabase) {
    await supabase.from('teachers').update({ password_changed: false }).eq('id', t.id);
    refresh();
  }
}
async function toggleStatus(t: Teacher, refresh: () => void) {
  if (!HAS_SUPABASE || !supabase) return;
  const next = t.status === 'active' ? 'inactive' : 'active';
  await supabase.from('teachers').update({ status: next }).eq('id', t.id);
  refresh();
}
async function archive(t: Teacher, refresh: () => void) {
  if (!HAS_SUPABASE || !supabase) return;
  if (!confirm(`Archive ${t.name}? They will no longer be able to log in.`)) return;
  await supabase.from('teachers').update({ status: 'archived' }).eq('id', t.id);
  refresh();
}

/* ============================================================
 *  Add / Edit sheet
 * ========================================================== */
function TeacherForm({ existing, onClose }: { existing?: Teacher; onClose: () => void }) {
  const { user } = useAuth();
  const { findCollege } = useTenant();
  const college = user?.college_id ? findCollege(user.college_id) : undefined;
  const departments = college?.departments ?? [];

  const isEdit = !!existing;

  const [name, setName]         = useState(existing?.name || '');
  const [username, setUsername] = useState(existing?.username || '');
  const [empId, setEmpId]       = useState(existing?.emp_id || '');
  const [phone, setPhone]       = useState(existing?.phone || '');
  const [email, setEmail]       = useState(existing?.email || '');
  const [deptId, setDeptId]     = useState<string>(existing?.department_id || departments[0]?.id || '');
  const [pwd, setPwd]           = useState(existing ? '' : ''); // filled after typing username
  const [subjects, setSubjects] = useState<string>((existing?.assigned_subjects || []).join(', '));
  const [sections, setSections] = useState<string>((existing?.assigned_sections || []).join(', '));
  const [semesters, setSemesters] = useState<string>((existing?.assigned_semesters || []).join(', '));
  const [courses, setCourses]   = useState<string>((existing?.assigned_courses || []).join(', '));

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string>(existing?.photo_url || '');

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});

  // Auto-suggest username + default password from the name
  useEffect(() => {
    if (!isEdit && name && !username) {
      const u = usernameFromName(name);
      setUsername(u);
      setPwd(defaultPasswordFor(u));
      if (!empId) setEmpId(u.toUpperCase());
    }
  }, [name]);

  useEffect(() => {
    if (!isEdit && username && !pwd) setPwd(defaultPasswordFor(username));
  }, [username]);

  const shadowEmail = user?.college_id && username
    ? teacherEmailFor(username, user.college_id) : '';

  const copyBootstrap = () => {
    if (!shadowEmail || !pwd) return;
    const txt = `EMAIL:    ${shadowEmail}\nPASSWORD: ${pwd}`;
    navigator.clipboard.writeText(txt).then(() =>
      setMsg({ ok: 'Copied — paste in Supabase → Auth → Add User.' })
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg({});
    if (!user?.college_id) return setMsg({ err: 'No college in session.' });
    if (!name.trim() || !username.trim()) return setMsg({ err: 'Name and username are required.' });
    if (!isEdit && !pwd) return setMsg({ err: 'Default password is required.' });
    if (!HAS_SUPABASE || !supabase) return setMsg({ err: 'Supabase not connected.' });

    setBusy(true);
    try {
      let uploaded = existing?.photo_url || photoUrl || null;
      if (photoFile) {
        const ext = photoFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `teachers/${user.college_id}/${username}.${ext}`;
        const { error } = await supabase.storage.from('avatars').upload(path, photoFile, { upsert: true, contentType: photoFile.type });
        if (error) throw error;
        uploaded = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      }

      const payload: Partial<Teacher> = {
        college_id: user.college_id,
        department_id: deptId || null,
        emp_id: empId || username.toUpperCase(),
        username: username.trim().toLowerCase(),
        name: name.trim(),
        email: email || null,
        phone: phone || null,
        photo_url: uploaded,
        assigned_courses:   courses.split(',').map(s => s.trim()).filter(Boolean),
        assigned_semesters: semesters.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0),
        assigned_sections:  sections.split(',').map(s => s.trim()).filter(Boolean),
        assigned_subjects:  subjects.split(',').map(s => s.trim()).filter(Boolean)
      };

      if (isEdit) {
        const { error } = await supabase.from('teachers').update(payload).eq('id', existing!.id);
        if (error) throw error;
        setMsg({ ok: 'Teacher updated.' });
      } else {
        // insert with password_changed=false so first-login flow triggers
        const { error } = await supabase.from('teachers').insert({ ...payload, password_changed: false, status: 'active' });
        if (error) throw error;
        setMsg({
          ok: `Row added. Now create the auth user in Supabase → Authentication → Add User with:\n\n` +
              `EMAIL:    ${shadowEmail}\nPASSWORD: ${pwd}\n\n(Then teacher signs in with username "${username}" + that password.)`
        });
      }
      setTimeout(onClose, 1400);
    } catch (e: any) {
      setMsg({ err: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
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
          <div className="h-title clip-1">{isEdit ? 'Edit teacher' : 'Add teacher'}</div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-full glass grid place-items-center ml-auto shrink-0"><X size={16}/></button>
        </div>

        {/* Photo */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative">
            {photoUrl
              ? <img src={photoUrl} className="h-16 w-16 rounded-2xl border border-white/60 bg-white"/>
              : <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-ios-purple to-ios-pink text-white grid place-items-center font-bold text-xl">
                  {(name || username || '?').trim()[0]?.toUpperCase()}
                </div>}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <T label="Full Name*"          value={name}     onChange={setName}     placeholder="e.g. Sri. Praveen Akkimaradi"/>
          <T label="Username*"           value={username} onChange={v => setUsername(v.toLowerCase().replace(/\s+/g,''))} placeholder="e.g. praveen" disabled={isEdit}/>
          <T label="Employee ID"         value={empId}    onChange={setEmpId}    placeholder="Auto from username"/>
          <Select label="Department"     value={deptId}   onChange={setDeptId}   options={departments.map(d => ({ v: d.id, l: d.code }))}/>
          <T label="Phone"               value={phone}    onChange={setPhone}    type="tel"/>
          <T label="Contact Email"       value={email}    onChange={setEmail}    type="email" placeholder="Optional (not used for login)"/>
          <T label="Assigned Subjects"   value={subjects} onChange={setSubjects} placeholder="e.g. SE, DA"/>
          <T label="Assigned Sections"   value={sections} onChange={setSections} placeholder="e.g. A, B"/>
          <T label="Assigned Semesters"  value={semesters} onChange={setSemesters} placeholder="e.g. 5, 6"/>
          <T label="Assigned Courses"    value={courses}  onChange={setCourses}  placeholder="e.g. BCA"/>
        </div>

        {!isEdit && (
          <div className="mt-4 rounded-2xl border border-ios-blue/30 bg-ios-blue/10 p-3 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-ios-blue">Login credentials to give this teacher</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div><span className="opacity-60">Username: </span><b>{username || '—'}</b></div>
              <div className="min-w-0">
                <span className="opacity-60">Default password: </span>
                <input value={pwd} onChange={e => setPwd(e.target.value)}
                  className="ml-1 bg-white/60 dark:bg-white/10 rounded-lg px-2 py-1 text-sm outline-none w-40"/>
              </div>
              <div className="sm:col-span-2 text-[11px] opacity-70">
                Behind the scenes: Supabase auth email will be
                <b className="mx-1 clip-1">{shadowEmail}</b>
                — the teacher never sees this.
              </div>
            </div>
            <button type="button" onClick={copyBootstrap} className="chip !text-ios-blue">
              <Copy size={12}/> Copy email + password for Supabase Auth
            </button>
          </div>
        )}

        {msg.err && <div className="mt-4 rounded-2xl border border-ios-red/30 bg-ios-red/10 px-3 py-2 text-sm flex items-start gap-2 text-ios-red whitespace-pre-wrap">
          <AlertCircle size={16} className="mt-0.5 shrink-0"/> {msg.err}
        </div>}
        {msg.ok && <div className="mt-4 rounded-2xl border border-ios-green/30 bg-ios-green/10 px-3 py-2 text-sm flex items-start gap-2 text-ios-green whitespace-pre-wrap">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0"/> {msg.ok}
        </div>}

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary flex-1 disabled:opacity-60">
            {busy ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}
            {isEdit ? 'Save changes' : 'Add teacher'}
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
  label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[];
}) {
  return (
    <div className="min-w-0">
      <label className="text-[11px] uppercase tracking-wider opacity-60 font-semibold">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ios-blue/40">
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}
