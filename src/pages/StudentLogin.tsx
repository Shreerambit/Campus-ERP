import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoginShell, { Field, InputRow } from '../components/LoginShell';
import TenantPicker, { TenantSelection, loadLastSelection, saveLastSelection } from '../components/TenantPicker';
import { useAuth } from '../lib/auth';
import { useTenant } from '../lib/tenant';
import { GraduationCap, User, Calendar, Eye, EyeOff, AlertCircle, Info, ArrowRight, ArrowLeft } from 'lucide-react';

/**
 * Simpler login: student picks College → Department → Course (no manual
 * Semester/Section). We look up their section + semester from the DB by
 * their Reg No so they can never impersonate a different class.
 */
export default function StudentLogin() {
  const nav = useNavigate();
  const { loginStudent } = useAuth();
  const { colleges } = useTenant();

  const [step, setStep] = useState<1 | 2>(1);
  const [sel, setSel] = useState<TenantSelection>({});
  const [regNo, setRegNo] = useState('');
  const [dob, setDob] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const last = loadLastSelection();
    if (!last?.college) return;
    const c = colleges.find(x => x.id === (last.college as any).id);
    if (!c) return;
    const d = c.departments.find(x => x.id === (last.department as any)?.id);
    const co = d?.courses.find(x => x.id === (last.course as any)?.id);
    setSel({ college: c, department: d, course: co });
  }, [colleges]);

  const canProceed = !!(sel.college && sel.department && sel.course);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!canProceed || !sel.college) return setError('Complete all selections first.');
    setBusy(true);
    const res = await loginStudent({
      collegeId: sel.college.id,
      regNo, dobISO: dob, remember
    });
    setBusy(false);
    if (!res.ok) return setError(res.error || 'Login failed.');
    saveLastSelection(sel);
    nav(res.firstLogin ? '/first-login' : '/dashboard');
  };

  return (
    <LoginShell
      title={step === 1 ? 'Find your college' : 'Sign in'}
      subtitle={step === 1
        ? 'Choose your college, department and course'
        : `${sel.college?.short} · ${sel.course?.code}`}
      icon={<GraduationCap size={24}/>}
      gradient="from-ios-blue to-ios-indigo"
    >
      {step === 1 ? (
        <>
          <TenantPicker value={sel} onChange={setSel} showSection={false} showSemester={false}/>
          <button type="button" disabled={!canProceed} onClick={() => { setError(null); setStep(2); }}
            className="btn-primary w-full mt-5 disabled:opacity-50 disabled:cursor-not-allowed">
            Continue <ArrowRight size={16}/>
          </button>
          <p className="mt-3 text-[11px] opacity-60 text-center">
            Your section and semester are read automatically from your college record.
          </p>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <button type="button" onClick={() => setStep(1)}
            className="chip mb-4"><ArrowLeft size={12}/> Change college</button>

          <Field label="Registration Number / USN">
            <InputRow icon={<User size={16}/>}>
              <input
                className="w-full bg-transparent outline-none text-[15px] uppercase tracking-wide"
                placeholder="e.g. U26ZW24S0001"
                value={regNo}
                onChange={e => setRegNo(e.target.value)}
                autoComplete="username"
                required
                autoFocus
              />
            </InputRow>
          </Field>

          <Field
            label="Password (Date of Birth)"
            hint={<span className="flex items-center gap-1.5"><Info size={12}/>Your default password is your DOB. You'll set a new password after first login.</span>}
          >
            <InputRow icon={<Calendar size={16}/>}>
              <input
                type={showPwd ? 'text' : 'date'}
                className="w-full bg-transparent outline-none text-[15px]"
                value={dob}
                onChange={e => setDob(e.target.value)}
                required
              />
              <button type="button" onClick={() => setShowPwd(v => !v)} className="opacity-70 hover:opacity-100">
                {showPwd ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </InputRow>
          </Field>

          <div className="flex items-center justify-between text-sm mb-4">
            <label className="inline-flex items-center gap-2 select-none">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                className="h-4 w-4 rounded accent-ios-blue"/>
              Remember me
            </label>
            <button type="button" className="text-ios-blue opacity-80 hover:opacity-100">
              Forgot password?
            </button>
          </div>

          {error && (
            <div className="mb-3 rounded-2xl border border-ios-red/30 bg-ios-red/10 px-3 py-2.5 text-sm flex items-start gap-2 text-ios-red">
              <AlertCircle size={16} className="mt-0.5 shrink-0"/> <span>{error}</span>
            </div>
          )}
          <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-60">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}
    </LoginShell>
  );
}
