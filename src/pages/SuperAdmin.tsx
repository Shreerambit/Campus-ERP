import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Plus, Trash2, PauseCircle, PlayCircle, Users, BookOpen, LogOut, X, Crown, TrendingUp } from 'lucide-react';
import { useTenant } from '../lib/tenant';
import { useCollegeStudents } from '../lib/liveData';
import { useAuth } from '../lib/auth';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../lib/theme';
import { Sun, Moon } from 'lucide-react';
import { GradCapIcon } from '../components/Shell';

export default function SuperAdmin() {
  const nav = useNavigate();
  const { colleges, addCollege, updateCollege, deleteCollege } = useTenant();
  const { logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [creating, setCreating] = useState(false);

  const allByCollege = new Map<string, number>();
  for (const col of colleges) {
    // rough count via a per-college query would be N+1; keep 0 unless we add a view.
  }

  const totals = {
    colleges: colleges.length,
    active: colleges.filter(c => c.status === 'active').length,
    students: 0,               // Super admin gets a per-college count via a Supabase RPC (future).
    departments: colleges.reduce((n, c) => n + c.departments.length, 0)
  };

  return (
    <div className="min-h-dvh p-4 md:p-8 safe-bottom">
      <header className="flex items-center gap-3 mb-6">
        <img src="/brand-icon.png?v=5" alt="Campus ERP" className="h-10 w-10 rounded-[22%] shrink-0 shadow-hi"/>
        <div className="min-w-0 flex-1">
          <div className="h-section flex items-center gap-2">Campus ERP <Crown size={12} className="text-ios-orange"/> Super Admin</div>
          <div className="h-title truncate">Manage all colleges</div>
        </div>
        <button onClick={toggle} className="h-9 w-9 rounded-full glass grid place-items-center" aria-label="Toggle theme">
          {theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}
        </button>
        <button onClick={() => { logout(); nav('/welcome'); }} className="chip !text-ios-red"><LogOut size={12}/> Log out</button>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <TotalCard icon={<Building2 size={16}/>} label="Colleges"    value={totals.colleges}    tone="from-ios-blue to-ios-indigo"/>
        <TotalCard icon={<TrendingUp size={16}/>} label="Active"     value={totals.active}      tone="from-ios-green to-ios-teal"/>
        <TotalCard icon={<Users size={16}/>}      label="Students"    value={totals.students}    tone="from-ios-purple to-ios-pink"/>
        <TotalCard icon={<BookOpen size={16}/>}   label="Departments" value={totals.departments} tone="from-ios-orange to-ios-red"/>
      </section>

      <section className="card">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-title">Colleges</div>
          <button onClick={() => setCreating(true)} className="btn-primary ml-auto">
            <Plus size={16}/> Add College
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {colleges.map(c => {
            const count = 0; // per-college totals require a Supabase view; wire when needed.
            return (
              <motion.div key={c.id} layout
                className="rounded-3xl p-4 bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10">
                <div className="flex items-center gap-3">
                  <div className={`h-12 w-12 rounded-2xl grid place-items-center text-white font-black text-lg bg-gradient-to-br ${c.gradient} shrink-0`}>
                    {c.logoText}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[15px] clip-1">{c.name}</div>
                    <div className="text-xs opacity-60 clip-1">{c.code} · {c.city}</div>
                  </div>
                  <span className={`chip ${c.status === 'active' ? 'text-ios-green' : 'text-ios-orange'}`}>
                    ● {c.status}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <MiniStat label="Departments" value={c.departments.length}/>
                  <MiniStat label="Courses"     value={c.departments.reduce((n, d) => n + d.courses.length, 0)}/>
                  <MiniStat label="Students"    value={count}/>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {c.status === 'active'
                    ? <button onClick={() => updateCollege(c.id, { status: 'suspended' })} className="chip !text-ios-orange"><PauseCircle size={12}/> Suspend</button>
                    : <button onClick={() => updateCollege(c.id, { status: 'active' })}    className="chip !text-ios-green"><PlayCircle size={12}/> Reactivate</button>}
                  <button
                    onClick={() => { if (confirm('Delete this college and all its data?')) deleteCollege(c.id); }}
                    className="chip !text-ios-red ml-auto"><Trash2 size={12}/> Delete</button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      <AnimatePresence>
        {creating && <NewCollegeSheet onClose={() => setCreating(false)} onCreate={addCollege}/>}
      </AnimatePresence>
    </div>
  );
}

function TotalCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-3xl p-4 text-white bg-gradient-to-br ${tone}`}>
      <div className="text-[11px] opacity-90 flex items-center gap-1.5">{icon}{label}</div>
      <div className="stat-num mt-1">{value}</div>
    </div>
  );
}
function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/60 dark:bg-white/10 border border-white/60 dark:border-white/10 py-2">
      <div className="text-[10px] uppercase opacity-60 tracking-wider">{label}</div>
      <div className="font-bold tabular-nums">{value}</div>
    </div>
  );
}

function NewCollegeSheet({ onClose, onCreate }:{
  onClose: () => void;
  onCreate: (c: any) => void;
}) {
  const [form, setForm] = useState({ code: '', name: '', short: '', city: '', logoText: '' });
  const gradients = ['from-ios-blue to-ios-indigo', 'from-ios-purple to-ios-pink', 'from-ios-orange to-ios-red', 'from-ios-green to-ios-teal', 'from-ios-teal to-ios-blue'];
  const [gradient, setGradient] = useState(gradients[0]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm grid place-items-end md:place-items-center p-3"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        onClick={e => e.stopPropagation()}
        className="w-full md:w-[520px] max-h-[90vh] overflow-y-auto rounded-4xl glass p-5 shadow-hi"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="h-title">Add College</div>
          <button onClick={onClose} className="h-9 w-9 rounded-full glass grid place-items-center ml-auto"><X size={16}/></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Text label="Code (short)"        value={form.code}     onChange={v => setForm(f => ({ ...f, code: v.toUpperCase() }))} placeholder="ABCD"/>
          <Text label="Logo Letter"         value={form.logoText} onChange={v => setForm(f => ({ ...f, logoText: v.slice(0,1).toUpperCase() }))} placeholder="A"/>
          <Text label="Name"                value={form.name}     onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Full college name" className="col-span-2"/>
          <Text label="Short Name"          value={form.short}    onChange={v => setForm(f => ({ ...f, short: v }))} placeholder="Short name" className="col-span-2"/>
          <Text label="City"                value={form.city}     onChange={v => setForm(f => ({ ...f, city: v }))} placeholder="e.g. Bagalkote"/>
          <div>
            <div className="text-[11px] uppercase opacity-60 mb-1 font-semibold">Brand Gradient</div>
            <div className="flex flex-wrap gap-2">
              {gradients.map(g => (
                <button key={g} onClick={() => setGradient(g)}
                  className={`h-8 w-14 rounded-lg bg-gradient-to-br ${g} ${gradient === g ? 'ring-2 ring-black/40 dark:ring-white/60' : ''}`}/>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button
            className="btn-primary flex-1"
            onClick={() => {
              if (!form.code || !form.name || !form.city) { alert('Fill code, name and city.'); return; }
              onCreate({
                code: form.code, name: form.name, short: form.short || form.name, city: form.city,
                logoText: form.logoText || form.code[0], gradient, status: 'active', departments: []
              });
              onClose();
            }}
          >Create college</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Text({ label, value, onChange, placeholder, className }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={className}>
      <label className="text-[11px] uppercase tracking-wider opacity-60 font-semibold">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1 w-full rounded-xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ios-blue/40"/>
    </div>
  );
}
