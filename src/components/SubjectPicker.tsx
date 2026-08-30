import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, CheckCircle2, ArrowRight, RefreshCcw, Loader2 } from 'lucide-react';
import { useTeacherSubject } from '../lib/teacherSubject';

/**
 * Full-screen subject-selection gate for teachers. Shown whenever a teacher
 * has 2+ available subjects and none chosen. Blocks the app until chosen.
 */
export default function SubjectPicker({ open }: { open: boolean }) {
  return (
    <AnimatePresence>
      {open && <SubjectPickerModal blocking onClose={() => {}}/>}
    </AnimatePresence>
  );
}

/** "Change subject" chip button used in page headers. */
export function ChangeSubjectButton() {
  const [open, setOpen] = useState(false);
  const { selectedSubject } = useTeacherSubject();
  return (
    <>
      <button onClick={() => setOpen(true)} type="button" className="chip !gap-1.5">
        <RefreshCcw size={12}/> Change
        {selectedSubject && <span className="opacity-80">· {selectedSubject.shortCode}</span>}
      </button>
      <AnimatePresence>
        {open && <SubjectPickerModal onClose={() => setOpen(false)}/>}
      </AnimatePresence>
    </>
  );
}

/** Compact inline button used inside Attendance form fields. */
export function SubjectPickerInlineButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
              className="h-full px-2.5 rounded-xl bg-white/60 dark:bg-white/5 border border-white/60 dark:border-white/10 text-[11px] font-semibold shrink-0">
        Change
      </button>
      <AnimatePresence>
        {open && <SubjectPickerModal onClose={() => setOpen(false)}/>}
      </AnimatePresence>
    </>
  );
}

function SubjectPickerModal({ onClose, blocking = false }: { onClose: () => void; blocking?: boolean }) {
  const { availableSubjects, selectedSubject, selectSubject } = useTeacherSubject();
  const [localId, setLocalId] = useState<string | null>(selectedSubject?.id ?? null);
  const confirm = () => { if (localId) selectSubject(localId); onClose(); };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-md grid place-items-center p-4"
      onClick={blocking ? undefined : onClose}
    >
      <motion.form
        onSubmit={(e) => { e.preventDefault(); confirm(); }}
        initial={{ y: 30, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md glass rounded-4xl p-5 sm:p-6 shadow-hi"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-ios-blue to-ios-purple">
            <BookOpen size={20}/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="h-section">Select your subject</div>
            <div className="h-title clip-1">Which subject are you taking?</div>
          </div>
        </div>

        <p className="text-sm opacity-70 mb-4">
          Attendance and Notes will use this subject until you change it.
        </p>

        <div className="space-y-2 mb-5 max-h-[50vh] overflow-y-auto pr-1">
          {availableSubjects.length === 0 && (
            <div className="rounded-2xl border border-white/60 dark:border-white/10 p-4 text-center text-sm opacity-70 flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin"/> Loading your subjects…
            </div>
          )}
          {availableSubjects.map(s => {
            const active = localId === s.id;
            return (
              <button type="button" key={s.id} onClick={() => setLocalId(s.id)}
                className={`w-full text-left rounded-2xl border px-4 py-3 flex items-center gap-3 transition
                  ${active
                    ? 'border-ios-blue bg-ios-blue/10 ring-2 ring-ios-blue/30'
                    : 'border-white/60 dark:border-white/10 bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10'}`}>
                <div className={`h-10 w-10 rounded-xl grid place-items-center text-sm font-bold shrink-0
                  ${active ? 'bg-ios-blue text-white' : 'bg-black/5 dark:bg-white/10'}`}>
                  {s.shortCode || '—'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm sm:text-base clip-1">{s.name}</div>
                  <div className="text-[11px] opacity-60">{s.code} · Sem {s.semester ?? '—'}</div>
                </div>
                {active
                  ? <CheckCircle2 className="text-ios-blue shrink-0" size={20}/>
                  : <div className="h-5 w-5 rounded-full border-2 border-black/20 dark:border-white/20 shrink-0"/>}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2">
          {!blocking && (
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          )}
          <button type="submit" disabled={!localId}
            className="btn-primary flex-1 !gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            Continue <ArrowRight size={16}/>
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}
