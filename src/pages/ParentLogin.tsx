import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoginShell, { Field, InputRow } from '../components/LoginShell';
import TenantPicker, { TenantSelection } from '../components/TenantPicker';
import { useAuth } from '../lib/auth';
import { Users2, User, Lock, Eye, EyeOff, AlertCircle, ArrowRight, ArrowLeft } from 'lucide-react';

export default function ParentLogin() {
  const nav = useNavigate();
  const { loginParent } = useAuth();
  const [sel, setSel] = useState<TenantSelection>({});
  const [step, setStep] = useState<1 | 2>(1);
  const [regNo, setRegNo] = useState('U26ZW24S0001');
  const [pwd, setPwd] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    if (!sel.college) return setError('Please select the college.');
    const res = await loginParent({ collegeId: sel.college.id, regNo, password: pwd, remember });
    if (!res.ok) return setError(res.error || 'Login failed.');
    nav('/dashboard');
  };

  return (
    <LoginShell
      title={step === 1 ? 'Choose child\u2019s college' : 'Parent Sign in'}
      subtitle={step === 1 ? '' : sel.college?.short ?? ''}
      icon={<Users2 size={24}/>}
      gradient="from-ios-green to-ios-teal"
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
          <Field label="Student Registration Number">
            <InputRow icon={<User size={16}/>}>
              <input className="w-full bg-transparent outline-none text-[15px] uppercase"
                value={regNo} onChange={e => setRegNo(e.target.value)} required autoFocus/>
            </InputRow>
          </Field>
          <Field label="Parent Password" hint="Demo password: parent123">
            <InputRow icon={<Lock size={16}/>}>
              <input type={show ? 'text' : 'password'} className="w-full bg-transparent outline-none text-[15px]"
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
          <button className="btn-primary w-full">Sign in</button>
        </form>
      )}
    </LoginShell>
  );
}
