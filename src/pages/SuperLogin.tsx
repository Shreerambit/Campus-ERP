import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoginShell, { Field, InputRow } from '../components/LoginShell';
import { useAuth } from '../lib/auth';
import { Crown, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';

export default function SuperLogin() {
  const nav = useNavigate();
  const { loginSuper } = useAuth();
  const [id, setId] = useState('SUPER');
  const [pwd, setPwd] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    const res = await loginSuper(id, pwd, remember);
    if (!res.ok) return setError(res.error || 'Login failed.');
    nav('/super');
  };

  return (
    <LoginShell
      title="Super Admin"
      subtitle="Platform owner — manage all colleges"
      icon={<Crown size={24}/>}
      gradient="from-ios-orange to-ios-yellow"
    >
      <form onSubmit={submit}>
        <Field label="Super Admin ID">
          <InputRow icon={<Crown size={16}/>}>
            <input className="w-full bg-transparent outline-none text-[15px]"
              value={id} onChange={e => setId(e.target.value)} required autoFocus/>
          </InputRow>
        </Field>
        <Field label="Password" hint="Demo password: super123">
          <InputRow icon={<Lock size={16}/>}>
            <input type={show ? 'text' : 'password'} className="w-full bg-transparent outline-none text-[15px]"
              value={pwd} onChange={e => setPwd(e.target.value)} required/>
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
    </LoginShell>
  );
}
