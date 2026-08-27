import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Plus, X, CalendarDays, User, Send, Loader2, AlertCircle, CheckCircle2, Megaphone, RefreshCw, Trash2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useTenant } from '../lib/tenant';
import { useNotices, useCreateNotice, useDeleteNotice } from '../lib/liveData';
import { supabase } from '../lib/supabase';

const SCOPES = [
  { id: 'college',    label: 'Entire College' },
  { id: 'department', label: 'Department' },
  { id: 'course',     label: 'Course' },
  { id: 'semester',   label: 'Semester' },
  { id: 'section',    label: 'Section' }
] as const;

export default function Notices() {
  const { user } = useAuth();
  const { findCollege } = useTenant();
  const collegeId = user?.college_id;
  const college = collegeId ? findCollege(collegeId) : undefined;

  const { data: notices = [], isLoading, isError, error, refetch, isFetching } = useNotices(collegeId);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [authUid, setAuthUid] = useState<string | null>(null);

  // Cache the Supabase auth user id so we can tell which notices this
  // user authored (used to show the Delete button).
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setAuthUid(data.user?.id ?? null));
  }, []);

  const canCreate = user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'super';
  const isAdminOrSuper = user?.role === 'admin' || user?.role === 'super';
  // A teacher can delete a notice if EITHER:
  //   • The notice's created_by matches their auth UID (accurate), OR
  //   • The notice's created_by_name matches their display name (legacy
  //     notices posted before the created_by column was populated).
  //   • Or created_by is NULL AND the display names match.
  // The RLS in migration 015 makes the final decision at the database.
  const canDelete = (n: any) => {
    if (isAdminOrSuper) return true;
    if (user?.role !== 'teacher') return false;
    if (authUid && n.created_by === authUid) return true;
    if (user?.displayName && n.created_by_name === user.displayName) return true;
    return false;
  };

  return (
    <div className="space-y-4 min-w-0">
      <div className="card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-10 w-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-ios-pink to-ios-red shrink-0">
            <Megaphone size={18}/>
          </div>
          <div className="flex-1 min-w-[160px] no-x">
            <div className="h-section">Notices</div>
            <div className="h-title clip-1">{college?.short ?? 'Your college'}</div>
          </div>
          <button onClick={() => refetch()} className="chip" title="Refresh">
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''}/> Refresh
          </button>
          {canCreate && (
            <button onClick={() => setCreating(true)} className="btn-primary"><Plus size={16}/> New notice</button>
          )}
        </div>
      </div>

      {isLoading && <div className="card flex items-center gap-2"><Loader2 className="animate-spin"/> Loading notices…</div>}
      {isError && <div className="card border-ios-red/30 bg-ios-red/10 text-ios-red text-sm">
        <AlertCircle size={14} className="inline mr-1"/> {String((error as any)?.message || error)}
        <button onClick={() => refetch()} className="chip ml-2">Retry</button>
      </div>}

      {!isLoading && !isError && notices.length === 0 && (
        <div className="card text-center py-10">
          <Bell className="mx-auto text-ios-blue mb-2"/>
          <div className="h-title">No notices yet</div>
          <p className="text-sm opacity-70 mt-1">
            {canCreate ? 'Post your first notice for your class.' : 'Check back later.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {notices.map(n => (
          <motion.article key={n.id}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="card min-w-0 relative">
            <div className="flex items-center gap-3 min-w-0 mb-2">
              {n.created_by_photo
                ? <img src={n.created_by_photo} className="h-9 w-9 rounded-xl border border-white/60 bg-white shrink-0"/>
                : <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-ios-blue to-ios-indigo text-white grid place-items-center shrink-0"><User size={14}/></div>}
              <div className="min-w-0 flex-1">
                <div className="font-semibold clip-1">{n.title}</div>
                <div className="text-[11px] opacity-60 clip-1">
                  {n.created_by_name || 'Faculty'} · {new Date(n.created_at).toLocaleString()}
                </div>
              </div>
              <span className="chip shrink-0">{scopeLabel(n.target_scope)}</span>
            </div>
            <p className="text-sm opacity-90 whitespace-pre-wrap">{n.body}</p>
            {n.expires_at && (
              <div className="mt-2 text-[11px] opacity-60 flex items-center gap-1">
                <CalendarDays size={11}/> Expires {new Date(n.expires_at).toLocaleDateString()}
              </div>
            )}

            {canDelete(n) && (
              <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/10 flex items-center justify-end gap-2">
                <span className="text-[11px] opacity-60 mr-auto">
                  {isAdminOrSuper ? 'Admin controls' : 'Your notice'}
                </span>
                <button
                  onClick={() => setConfirmDelete(n.id)}
                  className="chip text-ios-red hover:bg-ios-red/10"
                  title="Delete this notice"
                >
                  <Trash2 size={12}/> Delete
                </button>
              </div>
            )}
          </motion.article>
        ))}
      </div>

      <AnimatePresence>
        {creating && <ComposeSheet onClose={() => { setCreating(false); refetch(); }}/>}
        {confirmDelete && (
          <ConfirmDelete
            noticeId={confirmDelete}
            collegeId={collegeId!}
            onClose={() => setConfirmDelete(null)}
            onDone={() => { setConfirmDelete(null); refetch(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function scopeLabel(s: string) {
  return SCOPES.find(x => x.id === s)?.label || s;
}

/* ---------------- Delete confirmation ---------------- */
function ConfirmDelete({ noticeId, collegeId, onClose, onDone }: {
  noticeId: string; collegeId: string; onClose: () => void; onDone: () => void;
}) {
  const { mutateAsync, isPending } = useDeleteNotice();
  const [error, setError] = useState<string | null>(null);

  const del = async () => {
    setError(null);
    try {
      await mutateAsync({ id: noticeId, college_id: collegeId });
      onDone();
    } catch (e: any) {
      setError(e?.message || 'Could not delete this notice. You may not have permission.');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 20, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm card"
      >
        <div className="text-center">
          <div className="mx-auto h-12 w-12 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-ios-red to-ios-pink mb-3">
            <Trash2 size={20}/>
          </div>
          <div className="h-title">Delete this notice?</div>
          <p className="text-sm opacity-70 mt-1">This cannot be undone. Everyone will lose access to it immediately.</p>
        </div>

        {error && (
          <div className="mt-3 rounded-2xl border border-ios-red/30 bg-ios-red/10 px-3 py-2.5 text-sm flex items-start gap-2 text-ios-red">
            <AlertCircle size={16} className="mt-0.5 shrink-0"/> <span>{error}</span>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={onClose} disabled={isPending} className="chip justify-center py-2.5">Cancel</button>
          <button onClick={del} disabled={isPending}
            className="btn-primary justify-center py-2.5 !bg-none"
            style={{ backgroundImage: 'linear-gradient(90deg,#FF3B30,#FF2D55)' }}>
            {isPending ? <><Loader2 size={14} className="animate-spin"/> Deleting…</> : <><Trash2 size={14}/> Delete</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ---------------- Compose ---------------- */
function ComposeSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { mutateAsync, isPending } = useCreateNotice();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [scope, setScope] = useState<typeof SCOPES[number]['id']>('college');
  const [expires, setExpires] = useState<string>('');
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!user?.college_id) return setError('No college in session.');
    try {
      await mutateAsync({
        college_id: user.college_id,
        title: title.trim(),
        body: body.trim(),
        target_scope: scope,
        target_ref: null,
        expires_at: expires ? new Date(expires).toISOString() : null,
        created_by_name: user.displayName || null,
        created_by_photo: user.photo || null
      } as any);
      setOk(true);
      setTimeout(onClose, 700);
    } catch (e: any) {
      setError(e?.message || 'Could not post the notice.');
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
        className="w-full md:w-[520px] rounded-4xl glass p-4 sm:p-5 shadow-hi max-h-[90vh] overflow-auto"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-ios-pink to-ios-red">
            <Megaphone size={18}/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="h-title">New notice</div>
            <div className="text-xs opacity-60">Posted as {user?.displayName}</div>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-full glass grid place-items-center"><X size={16}/></button>
        </div>

        <label className="text-[11px] uppercase tracking-wider font-semibold opacity-70">Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} required
          className="mt-1 mb-3 w-full rounded-2xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 px-4 py-2.5 text-sm outline-none"
          placeholder="e.g. Class cancelled tomorrow"/>

        <label className="text-[11px] uppercase tracking-wider font-semibold opacity-70">Message</label>
        <textarea value={body} onChange={e => setBody(e.target.value)} required rows={5}
          className="mt-1 mb-3 w-full rounded-2xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 px-4 py-2.5 text-sm outline-none resize-none"
          placeholder="Details…"/>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider font-semibold opacity-70">Audience</label>
            <select value={scope} onChange={e => setScope(e.target.value as any)}
              className="mt-1 w-full rounded-2xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 px-3 py-2.5 text-sm outline-none">
              {SCOPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider font-semibold opacity-70">Expires (optional)</label>
            <input type="date" value={expires} onChange={e => setExpires(e.target.value)}
              className="mt-1 w-full rounded-2xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 px-3 py-2.5 text-sm outline-none"/>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-2xl border border-ios-red/30 bg-ios-red/10 px-3 py-2.5 text-sm flex items-start gap-2 text-ios-red">
            <AlertCircle size={16} className="mt-0.5 shrink-0"/> <span>{error}</span>
          </div>
        )}
        {ok && (
          <div className="mb-3 rounded-2xl border border-ios-green/30 bg-ios-green/10 px-3 py-2.5 text-sm flex items-start gap-2 text-ios-green">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0"/> Notice posted!
          </div>
        )}

        <button type="submit" disabled={isPending || !title.trim() || !body.trim()}
          className="btn-primary w-full disabled:opacity-50">
          {isPending ? <><Loader2 size={16} className="animate-spin"/> Posting…</> : <><Send size={16}/> Post notice</>}
        </button>
      </motion.form>
    </motion.div>
  );
}
