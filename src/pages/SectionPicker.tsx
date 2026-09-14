/**
 * One-time section picker.
 *
 * Shown after login for any student whose `section` is NULL or not in
 * {A, B}. Choice is saved permanently to public.students and reflected
 * in the session immediately.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

export default function SectionPicker() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user, setSection } = useAuth();
  const [choice, setChoice] = useState<'A' | 'B' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const student = user?.student;

  const submit = async () => {
    if (!choice || !student || !supabase || !user?.college_id) return;
    setSaving(true); setError(null);
    try {
      const { error: e1 } = await supabase.from('students')
        .update({ section: choice, section_confirmed: true })
        .eq('id', student.db_id);
      if (e1) throw e1;
      // Update in-memory session + persisted store so scope refreshes
      setSection(choice);
      // Invalidate anything that filtered by empty section
      qc.invalidateQueries();
      nav('/dashboard', { replace: true });
    } catch (e: any) {
      setError(e.message || 'Could not save your section. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-dvh grid place-items-center p-6">
      <div className="pointer-events-none absolute inset-0 -z-10"
           style={{ background: 'radial-gradient(600px 400px at 10% 10%, rgba(48,125,255,.28), transparent), radial-gradient(500px 500px at 90% 90%, rgba(127,35,255,.28), transparent)' }}/>

      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md card"
      >
        <div className="text-center mb-5">
          <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center text-white shadow-hi mb-3 bg-gradient-to-br from-ios-blue to-ios-indigo">
            <Users size={22}/>
          </div>
          <div className="h-title">Select your section</div>
          <p className="text-sm opacity-70 mt-1">
            Hi {student?.name?.split(' ')[0]} — please tell us which section you belong to.
            You will only be asked this once.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {(['A', 'B'] as const).map(sec => (
            <button
              key={sec}
              onClick={() => setChoice(sec)}
              className={`rounded-2xl p-6 text-center border transition
                ${choice === sec
                  ? 'ring-2 ring-ios-blue border-ios-blue/40 bg-gradient-to-br from-ios-blue/20 to-ios-indigo/20'
                  : 'border-white/60 dark:border-white/10 bg-white/70 dark:bg-white/5 hover:border-ios-blue/40'}`}
            >
              <div className="text-4xl font-black tabular-nums text-ios-blue">{sec}</div>
              <div className="text-xs opacity-70 mt-1">Section {sec}</div>
              {choice === sec && (
                <CheckCircle2 className="mx-auto mt-2 text-ios-green" size={18}/>
              )}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-3 rounded-2xl border border-ios-red/30 bg-ios-red/10 px-3 py-2.5 text-sm flex items-start gap-2 text-ios-red">
            <AlertCircle size={16} className="mt-0.5 shrink-0"/> <span>{error}</span>
          </div>
        )}

        <button
          onClick={submit}
          disabled={!choice || saving}
          className="btn-primary w-full disabled:opacity-40"
        >
          {saving ? <><Loader2 size={16} className="animate-spin"/> Saving…</> : 'Save & continue'}
        </button>
        <p className="text-[11px] opacity-60 mt-3 text-center">
          If you pick the wrong section, ask your class teacher or admin to correct it for you.
        </p>
      </motion.div>
    </div>
  );
}
