import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { GradCapIcon } from './Shell';

export default function LoginShell({
  title, subtitle, icon, gradient, children
}: {
  title: string; subtitle: string; icon: React.ReactNode; gradient: string; children: React.ReactNode;
}) {
  const nav = useNavigate();
  return (
    <div className="min-h-dvh grid md:grid-cols-2">
      {/* Left visual */}
      <div className="hidden md:flex relative overflow-hidden items-center justify-center p-10">
        <div className="absolute inset-0"
             style={{
               background:
                 'radial-gradient(600px 400px at 20% 20%, rgba(10,132,255,.35), transparent), radial-gradient(500px 500px at 80% 80%, rgba(191,90,242,.35), transparent)'
             }} />
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 max-w-md text-center"
        >
          <img src="/brand-icon.png?v=5" alt="Campus ERP"
               className="mx-auto h-24 w-24 rounded-[22%] shadow-hi animate-floaty ring-1 ring-white/10"/>
          <div className={`mt-4 inline-flex h-10 w-10 rounded-2xl grid place-items-center text-white shadow-soft bg-gradient-to-br ${gradient}`}>
            {icon}
          </div>
          <h1 className="mt-4 h-display bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(135deg,#307DFF 0%,#3C3DFF 55%,#7F23FF 100%)' }}>
            {title}
          </h1>
          <p className="mt-2 opacity-70">{subtitle}</p>
        </motion.div>
      </div>

      {/* Right form */}
      <div className="grid place-items-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-md card relative"
        >
          <button onClick={() => nav('/welcome')}
            className="absolute -top-2 -left-2 md:-left-4 md:-top-4 chip">
            <ArrowLeft size={14}/> Back
          </button>

          {/* Brand */}
          <div className="md:hidden flex items-center justify-center gap-2 mb-3">
            <img src="/brand-icon.png?v=5" className="h-8 w-8 rounded-lg" alt=""/>
            <span className="text-[14px] font-bold tracking-tight bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(135deg,#307DFF 0%,#3C3DFF 55%,#7F23FF 100%)' }}>
              Campus ERP
            </span>
          </div>

          <div className="text-center mb-6">
            <div className={`mx-auto h-12 w-12 md:hidden rounded-2xl grid place-items-center text-white shadow-hi mb-4 bg-gradient-to-br ${gradient}`}>
              {icon}
            </div>
            <div className="h-title">{title}</div>
            <div className="text-sm opacity-60 mt-1">{subtitle}</div>
          </div>

          {children}
        </motion.div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="text-[11px] uppercase tracking-wider font-semibold opacity-70">{label}</label>
      <div className="mt-1">{children}</div>
      {hint && <div className="mt-1 text-[11px] opacity-60">{hint}</div>}
    </div>
  );
}

export function InputRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-white/5 px-4 py-3">
      <div className="opacity-60">{icon}</div>
      {children}
    </div>
  );
}
