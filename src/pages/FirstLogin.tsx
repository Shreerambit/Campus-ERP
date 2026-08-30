import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { KeyRound, Lock, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../lib/auth';

export default function FirstLogin() {
  const nav = useNavigate();
  const { user, changePassword, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const strength = scoreStrength(next);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== confirm) return setError('New password and confirmation do not match.');
    if (next.length < 6) return setError('New password must be at least 6 characters.');
    const res = await changePassword(current, next);
    if (!res.ok) return setError(res.error || 'Could not change password.');
    setOk(true);
    setTimeout(() => nav('/dashboard'), 900);
  };

  return (
    <div className="min-h-dvh grid place-items-center p-6">
      <div className="pointer-events-none absolute inset-0 -z-10"
           style={{ background: 'radial-gradient(600px 400px at 10% 10%, rgba(10,132,255,.3), transparent), radial-gradient(500px 500px at 90% 90%, rgba(191,90,242,.3), transparent)' }}/>

      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md card"
      >
        <div className="text-center mb-5">
          <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center text-white shadow-hi mb-3 bg-gradient-to-br from-ios-blue to-ios-indigo">
            <KeyRound size={22}/>
          </div>
          <div className="h-title">Set a new password</div>
          <div className="text-sm opacity-70 mt-1">
            Welcome{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''} —
            please change your default password before continuing.
          </div>
        </div>

        <form onSubmit={submit}>
          <PwdField
            label={user?.role === 'teacher' ? 'Current password (default from admin)' : 'Current password (Date of Birth)'}
            value={current} onChange={setCurrent} show={show} onToggle={() => setShow(v => !v)}
            placeholder={user?.role === 'teacher' ? 'e.g. teacherpraveen' : 'yyyy-mm-dd or your current'}/>
          <PwdField label="New password" value={next} onChange={setNext} show={show} onToggle={() => setShow(v => !v)} placeholder="At least 6 characters"/>
          <div className="mb-3">
            <div className="h-1.5 w-full rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
              <div className={`h-full transition-all ${strength.color}`} style={{ width: `${strength.pct}%` }}/>
            </div>
            <div className="text-[11px] opacity-70 mt-1">Strength: <b>{strength.label}</b></div>
          </div>
          <PwdField label="Confirm new password" value={confirm} onChange={setConfirm} show={show} onToggle={() => setShow(v => !v)}/>

          {error && (
            <div className="mb-3 rounded-2xl border border-ios-red/30 bg-ios-red/10 px-3 py-2.5 text-sm flex items-start gap-2 text-ios-red">
              <AlertCircle size={16} className="mt-0.5 shrink-0"/> <span>{error}</span>
            </div>
          )}
          {ok && (
            <div className="mb-3 rounded-2xl border border-ios-green/30 bg-ios-green/10 px-3 py-2.5 text-sm flex items-start gap-2 text-ios-green">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0"/> Password updated — redirecting…
            </div>
          )}

          <button type="submit" className="btn-primary w-full">Update password & continue</button>
          <button type="button" onClick={() => { logout(); nav('/welcome'); }}
            className="mt-3 w-full text-sm opacity-70 hover:opacity-100 underline underline-offset-2">
            Cancel and sign out
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function PwdField({ label, value, onChange, show, onToggle, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void; placeholder?: string;
}) {
  return (
    <div className="mb-3">
      <label className="text-[11px] uppercase tracking-wider font-semibold opacity-70">{label}</label>
      <div className="mt-1 flex items-center gap-2 rounded-2xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-white/5 px-4 py-3">
        <Lock size={16} className="opacity-60"/>
        <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
          className="w-full bg-transparent outline-none text-[15px]"
          placeholder={placeholder} required />
        <button type="button" onClick={onToggle}>{show ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
      </div>
    </div>
  );
}

function scoreStrength(p: string) {
  let s = 0;
  if (p.length >= 6) s++;
  if (p.length >= 10) s++;
  if (/[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  const pct = (s / 5) * 100;
  const label = ['Very weak','Weak','Okay','Good','Strong','Excellent'][s];
  const color = ['bg-ios-red','bg-ios-red','bg-ios-orange','bg-ios-yellow','bg-ios-green','bg-ios-green'][s];
  return { pct, label, color };
}
