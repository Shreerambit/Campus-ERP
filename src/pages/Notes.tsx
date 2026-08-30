/**
 * Notes page — shared between teachers and students.
 *
 *   Teachers  → can add a note (title + optional text + optional PDF),
 *               and can delete their own notes.
 *   Students  → see the notes for their semester, can open / download PDFs.
 *   Admin/super → full access.
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen, Plus, X, Send, Loader2, AlertCircle, CheckCircle2,
  Paperclip, Download, RefreshCw, Trash2, ExternalLink, FileText
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useTenant } from '../lib/tenant';
import { useScope } from '../lib/scope';
import {
  useNotes, useCreateNote, useDeleteNote, uploadNotePdf,
  useSubjects, useMyTeacher, useMyStudent
} from '../lib/liveData';
import { supabase } from '../lib/supabase';
import { dedupeSubjects } from '../lib/teacherSubject';
import { useTeacherSubject } from '../lib/teacherSubject';
import { ChangeSubjectButton, SubjectPickerInlineButton } from '../components/SubjectPicker';
import { useEffect } from 'react';

export default function Notes() {
  const { user } = useAuth();
  const { findCollege } = useTenant();
  const scope = useScope();
  const collegeId = user?.college_id;
  const college = collegeId ? findCollege(collegeId) : undefined;

  const isTeacher = user?.role === 'teacher';
  const isAdminOrSuper = user?.role === 'admin' || user?.role === 'super';
  const canCreate = isTeacher || isAdminOrSuper;

  // Student sees only their own semester's notes; teacher/admin see everything for
  // their currently-scoped semester (they can change semester in the header pickers).
  const { data: me } = useMyStudent(user?.id, collegeId);
  const targetSemester = user?.role === 'student' || user?.role === 'parent'
    ? (me?.semester_number || scope.semester)
    : scope.semester;

  const { selectedSubject, availableSubjects: teacherAvailable } = useTeacherSubject();
  const notesFilter = useMemo(() => {
    const f: { semester: number; subjectId?: string } = { semester: targetSemester };
    if (isTeacher && selectedSubject) f.subjectId = selectedSubject.id;
    return f;
  }, [targetSemester, isTeacher, selectedSubject]);

  const { data: notes = [], isLoading, isError, error, refetch, isFetching } =
    useNotes(collegeId, notesFilter);

  // Cache the auth uid so we can tell which notes this teacher owns
  const [authUid, setAuthUid] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setAuthUid(data.user?.id ?? null));
  }, []);
  const { data: myTeacher } = useMyTeacher(collegeId, user?.id);

  const canDelete = (n: any) => {
    if (isAdminOrSuper) return true;
    if (isTeacher && myTeacher?.id && n.uploaded_by === myTeacher.id) return true;
    return false;
  };

  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const del = useDeleteNote();

  return (
    <div className="space-y-4 min-w-0">
      <div className="card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-10 w-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-ios-blue to-ios-purple shrink-0">
            <BookOpen size={18}/>
          </div>
          <div className="flex-1 min-w-[160px] no-x">
            <div className="h-section">Notes</div>
            <div className="h-title clip-1">
              Sem {targetSemester} · {college?.short || 'Your college'}
            </div>
          </div>
          <button onClick={() => refetch()} className="chip">
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''}/> Refresh
          </button>
          {isTeacher && <ChangeSubjectButton/>}
          {canCreate && (
            <button onClick={() => setCreating(true)} className="btn-primary">
              <Plus size={16}/> Add note
            </button>
          )}
        </div>
      </div>

      {isLoading && <div className="card flex items-center gap-2"><Loader2 className="animate-spin"/> Loading notes…</div>}
      {isError && <div className="card border-ios-red/30 bg-ios-red/10 text-ios-red text-sm">
        <AlertCircle size={14} className="inline mr-1"/> {String((error as any)?.message || error)}
        <button onClick={() => refetch()} className="chip ml-2">Retry</button>
      </div>}

      {!isLoading && !isError && notes.length === 0 && (
        <div className="card text-center py-10">
          <FileText className="mx-auto text-ios-blue mb-2" size={28}/>
          <div className="h-title">No notes yet</div>
          <p className="text-sm opacity-70 mt-1">
            {canCreate ? 'Add your first note or upload a PDF for your students.' : 'Your teachers haven’t shared any notes yet.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {notes.map(n => (
          <motion.article key={n.id}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="card min-w-0">
            <div className="flex items-start gap-3 min-w-0 mb-2">
              <div className="h-10 w-10 rounded-xl grid place-items-center text-white shrink-0 bg-gradient-to-br from-ios-blue to-ios-indigo">
                {n.kind === 'pdf' || n.path_or_url ? <FileText size={16}/> : <BookOpen size={16}/>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold clip-1">{n.title}</div>
                <div className="text-[11px] opacity-60 clip-1">
                  {n.subject?.code ? <>{n.subject.code.replace(/^BVVS-/i,'')} · </> : null}
                  {n.teacher?.name || 'Faculty'} · {new Date(n.created_at).toLocaleDateString()}
                </div>
              </div>
              {n.subject?.code && <span className="chip shrink-0">{n.subject.code.replace(/^BVVS-/i,'')}</span>}
            </div>

            {n.body && (
              <p className="text-sm opacity-90 whitespace-pre-wrap">{n.body}</p>
            )}

            {n.path_or_url && (
              <div className="mt-3 rounded-2xl border border-white/60 dark:border-white/10 bg-white/60 dark:bg-white/5 p-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-ios-red to-ios-pink text-white grid place-items-center shrink-0">
                  <FileText size={16}/>
                </div>
                <div className="text-xs opacity-70 flex-1 min-w-0 clip-1">
                  {n.path_or_url.split('/').pop()?.replace(/^\d+-/, '') || 'PDF attachment'}
                </div>
                <a href={n.path_or_url} target="_blank" rel="noreferrer" className="chip shrink-0">
                  <ExternalLink size={12}/> Open
                </a>
                <a href={n.path_or_url} download className="chip shrink-0 text-ios-blue">
                  <Download size={12}/> Download
                </a>
              </div>
            )}

            {canDelete(n) && (
              <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/10 flex items-center justify-end gap-2">
                <span className="text-[11px] opacity-60 mr-auto">
                  {isAdminOrSuper ? 'Admin controls' : 'Your note'}
                </span>
                <button
                  onClick={() => setConfirmDelete(n.id)}
                  className="chip text-ios-red hover:bg-ios-red/10">
                  <Trash2 size={12}/> Delete
                </button>
              </div>
            )}
          </motion.article>
        ))}
      </div>

      <AnimatePresence>
        {creating && (
          <ComposeSheet
            targetSemester={targetSemester}
            onClose={() => { setCreating(false); refetch(); }}
          />
        )}
        {confirmDelete && (
          <ConfirmDelete
            noteId={confirmDelete}
            onClose={() => setConfirmDelete(null)}
            onConfirm={async () => {
              await del.mutateAsync({ id: confirmDelete, college_id: collegeId });
              setConfirmDelete(null); refetch();
            }}
            pending={del.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- Delete confirmation ---------------- */
function ConfirmDelete({ noteId: _n, onClose, onConfirm, pending }: {
  noteId: string; onClose: () => void; onConfirm: () => void; pending: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}>
      <motion.div initial={{ y: 20, opacity: 0, scale: .96 }} animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0, scale: .96 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm card">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-ios-red to-ios-pink mb-3">
            <Trash2 size={20}/>
          </div>
          <div className="h-title">Delete this note?</div>
          <p className="text-sm opacity-70 mt-1">This cannot be undone.</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={onClose} disabled={pending} className="chip justify-center py-2.5">Cancel</button>
          <button onClick={onConfirm} disabled={pending}
            className="btn-primary justify-center py-2.5 !bg-none"
            style={{ backgroundImage: 'linear-gradient(90deg,#FF3B30,#FF2D55)' }}>
            {pending ? <><Loader2 size={14} className="animate-spin"/> Deleting…</> : <><Trash2 size={14}/> Delete</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ---------------- Compose sheet ---------------- */
function ComposeSheet({ targetSemester, onClose }: { targetSemester: number; onClose: () => void }) {
  const { user } = useAuth();
  const { data: allSubjects = [] } = useSubjects(user?.college_id);
  const isTeacher = user?.role === 'teacher';
  const { selectedSubject, availableSubjects: teacherAvailable } = useTeacherSubject();

  // Deduplicated subject list. Teachers get only their assigned subjects
  // (mirrors the picker gate); admins see all deduped semester subjects.
  const semSubjects = useMemo(() => {
    const deduped = dedupeSubjects(allSubjects.filter(s => s.semester === targetSemester));
    if (!isTeacher) return deduped;
    return teacherAvailable;
  }, [allSubjects, targetSemester, isTeacher, teacherAvailable]);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  // Teachers: pre-fill their chosen subject (required to exist before Add is clickable).
  // Admins: no auto-select — must pick explicitly if multiple.
  const [subjectId, setSubjectId] = useState<string>(
    isTeacher ? (selectedSubject?.id || '') : (semSubjects.length === 1 ? semSubjects[0].id : '')
  );
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const create = useCreateNote();

  useEffect(() => {
    if (isTeacher && selectedSubject?.id && !semSubjects.find(s => s.id === subjectId)) {
      setSubjectId(selectedSubject.id);
    }
  }, [selectedSubject?.id, isTeacher, semSubjects, subjectId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setOk(false);
    if (!user?.college_id) return setError('No college in session.');
    if (!subjectId) return setError('Pick a subject first.');
    if (!title.trim()) return setError('Give the note a title.');
    if (!body.trim() && !file) return setError('Add some text or attach a PDF.');

    setUploading(true);
    try {
      let path_or_url: string | null = null;
      if (file) {
        const code = semSubjects.find(s => s.id === subjectId)?.shortCode || 'general';
        path_or_url = await uploadNotePdf(user.college_id, code, file);
      }
      await create.mutateAsync({
        college_id: user.college_id,
        subject_id: subjectId,
        title: title.trim(),
        body: body.trim() || null,
        kind: file ? 'pdf' : 'note',
        path_or_url
      });
      setOk(true);
      setTimeout(onClose, 700);
    } catch (err: any) {
      setError(err?.message || 'Could not save note.');
    } finally { setUploading(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-end md:place-items-center bg-black/40 backdrop-blur-sm p-3"
      onClick={onClose}>
      <motion.form
        onSubmit={submit}
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        onClick={e => e.stopPropagation()}
        className="w-full md:w-[520px] rounded-4xl glass p-4 sm:p-5 shadow-hi max-h-[90vh] overflow-auto"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-ios-blue to-ios-purple">
            <BookOpen size={18}/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="h-title">Add note</div>
            <div className="text-xs opacity-60">Sem {targetSemester} · {user?.displayName}</div>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-full glass grid place-items-center">
            <X size={16}/>
          </button>
        </div>

        <label className="text-[11px] uppercase tracking-wider font-semibold opacity-70">Subject</label>
        <select value={subjectId} onChange={e => setSubjectId(e.target.value)}
          className="mt-1 mb-3 w-full rounded-2xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 px-3 py-2.5 text-sm outline-none">
          {!isTeacher && !subjectId && <option value="">— Pick a subject —</option>}
          {semSubjects.length === 0 && <option value="">(No subjects for this semester)</option>}
          {semSubjects.map(s => (
            <option key={s.id} value={s.id}>{s.shortCode} · {s.name}</option>
          ))}
        </select>

        <label className="text-[11px] uppercase tracking-wider font-semibold opacity-70">Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} required
          className="mt-1 mb-3 w-full rounded-2xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 px-4 py-2.5 text-sm outline-none"
          placeholder="e.g. Unit 3 – Chart types & KPIs"/>

        <label className="text-[11px] uppercase tracking-wider font-semibold opacity-70">Message (optional)</label>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={4}
          className="mt-1 mb-3 w-full rounded-2xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 px-4 py-2.5 text-sm outline-none resize-none"
          placeholder="A short description or study tips…"/>

        <label className="text-[11px] uppercase tracking-wider font-semibold opacity-70">PDF attachment (optional)</label>
        <label className="mt-1 mb-3 w-full rounded-2xl border border-dashed border-white/60 dark:border-white/10 bg-white/60 dark:bg-white/5 px-4 py-4 flex items-center gap-3 cursor-pointer hover:border-ios-blue/50 transition">
          <Paperclip size={16} className="opacity-70"/>
          <div className="text-sm flex-1 min-w-0 clip-1">
            {file ? file.name : 'Choose a PDF (max 15 MB)'}
          </div>
          <input type="file" accept="application/pdf,.pdf" className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 15 * 1024 * 1024) { setError('PDF is larger than 15 MB.'); return; }
              setError(null);
              setFile(f);
              e.target.value = '';
            }}/>
        </label>

        {error && (
          <div className="mb-3 rounded-2xl border border-ios-red/30 bg-ios-red/10 px-3 py-2.5 text-sm flex items-start gap-2 text-ios-red">
            <AlertCircle size={16} className="mt-0.5 shrink-0"/> <span>{error}</span>
          </div>
        )}
        {ok && (
          <div className="mb-3 rounded-2xl border border-ios-green/30 bg-ios-green/10 px-3 py-2.5 text-sm flex items-start gap-2 text-ios-green">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0"/> Note published.
          </div>
        )}

        <button type="submit" disabled={uploading || create.isPending}
          className="btn-primary w-full disabled:opacity-50">
          {uploading || create.isPending
            ? <><Loader2 size={16} className="animate-spin"/> Publishing…</>
            : <><Send size={16}/> Publish note</>}
        </button>
      </motion.form>
    </motion.div>
  );
}
