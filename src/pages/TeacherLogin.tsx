import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoginShell, { Field, InputRow } from '../components/LoginShell';
import TenantPicker, { TenantSelection } from '../components/TenantPicker';
import { useAuth } from '../lib/auth';
import { User, Lock, Eye, EyeOff, AlertCircle, ArrowRight, ArrowLeft, Info } from 'lucide-react';

export default function TeacherLogin() {
  const nav = useNavigate();
  const { loginTeacher } = useAuth();
  const [sel, setSel] = useState<TenantSelection>({});
  const [step, setStep] = useState<1 | 2>(1);
  const [username, setUsername] = useState('');
  const [pwd, setPwd] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!sel.college) return setError('Please select your college.');
    if (!username.trim()) return setError('Enter your username.');
    setBusy(true);
    // Send lowercase, spaces stripped
    const clean = username.trim().toLowerCase().replace(/\s+/g, '');
    const res = await loginTeacher({ collegeId: sel.college.id, empId: clean, password: pwd, remember });
    setBusy(false);
    if (!res.ok) return setError(res.error || 'Login failed.');
    nav('/dashboard');
  };

  return (
    <LoginShell
      title={step === 1 ? 'Select your college' : 'Teacher Sign in'}
      subtitle={step === 1 ? 'Only your assigned classes will be loaded' : sel.college?.short ?? ''}
      icon={<User size={24}/>}
      gradient="from-ios-purple to-ios-pink"
    >
      {step === 1 ? (
        <>
          <TenantPicker value={sel} onChange={setSel} showSection={false}/>
          <button disabled={!sel.college} onClick={() => setStep(2)}
            className="btn-primary w-full mt-5 disabled:opacity-50 disabled:cursor-not-allowed">
            Continue <ArrowRight size={16}/>
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          <button type="button" onClick={() => setStep(1)}
            className="chip mb-4"><ArrowLeft size={12}/> Change college</button>

          <Field label="Username"
            hint={<span className="flex items-center gap-1.5">
              <Info size={12}/> Use the username given by your college (e.g. <b>praveen</b>).
            </span>}>
            <InputRow icon={<User size={16}/>}>
              <input
                className="w-full bg-transparent outline-none text-[15px] lowercase tracking-wide"
                placeholder="e.g. praveen"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required autoFocus
              />
            </InputRow>
          </Field>

          <Field label="Password"
            hint={<span className="opacity-70">First-time users: enter the default password from your admin — you'll change it next.</span>}>
            <InputRow icon={<Lock size={16}/>}>
              <input type={show ? 'text' : 'password'}
                className="w-full bg-transparent outline-none text-[15px]"
                value={pwd} onChange={e => setPwd(e.target.value)} required autoComplete="current-password"/>
              <button type="button" onClick={() => setShow(v => !v)}>{show ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
            </InputRow>
          </Field>

          <label className="inline-flex items-center gap-2 text-sm mb-5">
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
              className="h-4 w-4 rounded accent-ios-blue"/> Remember me
          </label>

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
