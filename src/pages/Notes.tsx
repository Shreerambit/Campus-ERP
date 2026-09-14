/**
 * Notes page — shared between teachers and students.
 *
 *   Teachers    → can add notes (title + optional text + multiple files/images),
 *                 and can delete their own notes.
 *   Students    → see the notes for their semester, view image galleries & open/download documents.
 *   Admin/super → full access.
 */
import { useMemo, useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen, Plus, X, Send, Loader2, AlertCircle, CheckCircle2,
  Paperclip, Download, RefreshCw, Trash2, ExternalLink, FileText,
  Image as ImageIcon, FileSpreadsheet, MonitorPlay, Video, File,
  UploadCloud, Maximize2, Sparkles
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useTenant } from '../lib/tenant';
import { useScope } from '../lib/scope';
import {
  useNotes, useCreateNote, useDeleteNote, uploadNoteFile, getFileKind,
  useSubjects, useMyTeacher, useMyStudent, type Note
} from '../lib/liveData';
import { supabase } from '../lib/supabase';
import { dedupeSubjects } from '../lib/teacherSubject';
import { useTeacherSubject } from '../lib/teacherSubject';
import { ChangeSubjectButton } from '../components/SubjectPicker';
import { dispatchErpNotification } from '../lib/notifications';

export type NoteAttachment = {
  url: string;
  name: string;
  kind: Note['kind'];
  isImage: boolean;
};

/** Parse single URL string or JSON array of URLs into attachment objects */
export function parseNoteAttachments(pathOrUrl: string | null): NoteAttachment[] {
  if (!pathOrUrl) return [];
  let urls: string[] = [];
  const trimmed = pathOrUrl.trim();

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        urls = parsed.map(s => String(s)).filter(Boolean);
      }
    } catch {
      urls = [trimmed];
    }
  } else if (trimmed.includes('\n')) {
    urls = trimmed.split('\n').map(s => s.trim()).filter(Boolean);
  } else {
    urls = [trimmed];
  }

  return urls.map(url => {
    const cleanUrl = url.split('?')[0];
    const rawName = cleanUrl.split('/').pop() || 'Attachment';
    const cleanName = decodeURIComponent(rawName.replace(/^\d+-/, ''));
    const ext = cleanName.split('.').pop()?.toLowerCase() || '';
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext);

    let kind: Note['kind'] = 'doc';
    if (ext === 'pdf') kind = 'pdf';
    else if (['ppt', 'pptx'].includes(ext)) kind = 'ppt';
    else if (['doc', 'docx'].includes(ext)) kind = 'doc';
    else if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) kind = 'video';
    else if (isImage) kind = 'doc';

    return { url, name: cleanName, kind, isImage };
  });
}

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

  const { selectedSubject } = useTeacherSubject();
  const notesFilter = useMemo(() => {
    const f: { semester: number; subjectId?: string } = { semester: targetSemester };
    if (isTeacher && selectedSubject) f.subjectId = selectedSubject.id;
    return f;
  }, [targetSemester, isTeacher, selectedSubject]);

  const { data: notes = [], isLoading, isError, error, refetch, isFetching } =
    useNotes(collegeId, notesFilter);

  // Cache the auth uid so we can tell which notes this teacher owns
  const [, setAuthUid] = useState<string | null>(null);
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
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const del = useDeleteNote();

  return (
    <div className="space-y-4 min-w-0">
      <div className="card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-10 w-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-ios-blue to-ios-purple shrink-0 shadow-sm">
            <BookOpen size={18}/>
          </div>
          <div className="flex-1 min-w-[160px] no-x">
            <div className="h-section">Notes & Study Materials</div>
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
            {canCreate ? 'Add your first note or upload materials & images for your students.' : 'Your teachers haven’t shared any notes yet.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {notes.map(n => {
          const attachments = parseNoteAttachments(n.path_or_url);
          const images = attachments.filter(a => a.isImage);
          const docs = attachments.filter(a => !a.isImage);

          return (
            <motion.article key={n.id}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="card min-w-0 flex flex-col justify-between">
              <div>
                <div className="flex items-start gap-3 min-w-0 mb-2">
                  <div className="h-10 w-10 rounded-xl grid place-items-center text-white shrink-0 bg-gradient-to-br from-ios-blue to-ios-indigo">
                    {images.length > 0 ? (
                      <ImageIcon size={16}/>
                    ) : attachments.length > 0 ? (
                      <NoteKindIcon kind={attachments[0].kind} size={16}/>
                    ) : (
                      <BookOpen size={16}/>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold clip-1">{n.title}</div>
                    <div className="text-[11px] opacity-60 clip-1">
                      {n.subject?.code ? <>{n.subject.code.replace(/^BVVS-/i,'')} · </> : null}
                      {n.teacher?.name || 'Faculty'} · {new Date(n.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {attachments.length > 1 && (
                      <span className="chip text-[11px] gap-1" title={`${attachments.length} attachments`}>
                        <Paperclip size={12}/> {attachments.length}
                      </span>
                    )}
                    {n.subject?.code && <span className="chip">{n.subject.code.replace(/^BVVS-/i,'')}</span>}
                  </div>
                </div>

                {n.body && (
                  <p className="text-sm opacity-90 whitespace-pre-wrap">{n.body}</p>
                )}

                {attachments.length > 0 && (
                  <div className="mt-3 space-y-2.5">
                    {/* Images thumbnail gallery */}
                    {images.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] opacity-60 font-medium">
                          <span>Images ({images.length})</span>
                          <span className="text-[10px]">Click image to preview</span>
                        </div>
                        <div className={images.length === 1 ? 'w-full' : 'grid grid-cols-2 sm:grid-cols-3 gap-2'}>
                          {images.map((img, idx) => (
                            <div
                              key={img.url + idx}
                              onClick={() => setPreviewImage({ url: img.url, name: img.name })}
                              className="group relative rounded-xl overflow-hidden border border-white/60 dark:border-white/10 bg-black/5 dark:bg-white/5 cursor-pointer hover:shadow-md transition"
                            >
                              <img
                                src={img.url}
                                alt={img.name}
                                loading="lazy"
                                className={`w-full object-cover transition duration-300 group-hover:scale-105 ${images.length === 1 ? 'max-h-56' : 'h-24'}`}
                              />
                              <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2 text-white">
                                <span className="h-7 w-7 rounded-full bg-white/25 backdrop-blur-sm grid place-items-center hover:bg-white/40 transition" title="Preview">
                                  <Maximize2 size={13}/>
                                </span>
                                <a
                                  href={img.url}
                                  download={img.name}
                                  onClick={e => e.stopPropagation()}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="h-7 w-7 rounded-full bg-white/25 backdrop-blur-sm grid place-items-center hover:bg-white/40 transition"
                                  title="Download"
                                >
                                  <Download size={13}/>
                                </a>
                              </div>
                              {images.length > 1 && (
                                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 px-2 text-[10px] text-white clip-1 opacity-90">
                                  {img.name}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Non-image document attachments */}
                    {docs.length > 0 && (
                      <div className="space-y-1.5">
                        {images.length > 0 && (
                          <div className="text-[11px] opacity-60 font-medium">Files ({docs.length})</div>
                        )}
                        {docs.map((doc, idx) => (
                          <div
                            key={doc.url + idx}
                            className="rounded-2xl border border-white/60 dark:border-white/10 bg-white/60 dark:bg-white/5 p-2.5 sm:p-3 flex items-center gap-2.5 sm:gap-3"
                          >
                            <div className={`h-8 w-8 sm:h-9 sm:w-9 rounded-xl text-white grid place-items-center shrink-0 ${noteKindGradient(doc.kind)}`}>
                              <NoteKindIcon kind={doc.kind} size={15}/>
                            </div>
                            <div className="text-xs opacity-80 flex-1 min-w-0 clip-1">
                              {doc.name}
                              <span className="ml-1 opacity-60 uppercase font-semibold text-[10px]">[{noteKindLabel(doc.kind)}]</span>
                            </div>
                            <a href={doc.url} target="_blank" rel="noreferrer" className="chip shrink-0 text-xs">
                              <ExternalLink size={12}/> Open
                            </a>
                            <a href={doc.url} download={doc.name} className="chip shrink-0 text-ios-blue text-xs">
                              <Download size={12}/> Download
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

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
          );
        })}
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
        {previewImage && (
          <ImageLightbox
            image={previewImage}
            onClose={() => setPreviewImage(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- Image Lightbox Modal ---------------- */
function ImageLightbox({
  image,
  onClose
}: {
  image: { url: string; name: string };
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/85 backdrop-blur-md p-3 sm:p-5"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.93, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.93, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        onClick={e => e.stopPropagation()}
        className="relative max-w-4xl w-full flex flex-col items-center max-h-[92vh]"
      >
        <div className="w-full flex items-center justify-between gap-3 text-white pb-3">
          <span className="text-sm font-medium clip-1">{image.name}</span>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={image.url}
              download={image.name}
              target="_blank"
              rel="noreferrer"
              className="chip bg-white/20 text-white hover:bg-white/30 border-0"
            >
              <Download size={14}/> Download
            </a>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-full bg-white/20 hover:bg-white/30 grid place-items-center text-white transition"
            >
              <X size={16}/>
            </button>
          </div>
        </div>
        <img
          src={image.url}
          alt={image.name}
          className="max-h-[82vh] w-auto max-w-full object-contain rounded-2xl shadow-2xl border border-white/15"
        />
      </motion.div>
    </motion.div>
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
  const [subjectId, setSubjectId] = useState<string>(
    isTeacher ? (selectedSubject?.id || '') : (semSubjects.length === 1 ? semSubjects[0].id : '')
  );
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const create = useCreateNote();

  useEffect(() => {
    if (isTeacher && selectedSubject?.id && !semSubjects.find(s => s.id === subjectId)) {
      setSubjectId(selectedSubject.id);
    }
  }, [selectedSubject?.id, isTeacher, semSubjects, subjectId]);

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;

    const oversized = selected.filter(f => f.size > 50 * 1024 * 1024);
    if (oversized.length > 0) {
      setError(`"${oversized[0].name}" exceeds the 50 MB limit.`);
      return;
    }

    setError(null);
    // Append newly selected files while skipping duplicate name+size
    setFiles(prev => {
      const existingKeys = new Set(prev.map(f => `${f.name}_${f.size}`));
      const fresh = selected.filter(f => !existingKeys.has(`${f.name}_${f.size}`));
      return [...prev, ...fresh];
    });

    // Reset input value so re-selecting same file works
    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setOk(false);
    if (!user?.college_id) return setError('No college in session.');
    if (!subjectId) return setError('Pick a subject first.');
    if (!title.trim()) return setError('Give the note a title.');
    if (!body.trim() && files.length === 0) return setError('Add some text or attach file(s).');

    setUploading(true);
    try {
      let path_or_url: string | null = null;
      let primaryKind: Note['kind'] = 'note';

      if (files.length > 0) {
        const code = semSubjects.find(s => s.id === subjectId)?.shortCode || 'general';
        const uploadedUrls: string[] = [];

        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          setUploadStatus(files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : 'Uploading file…');
          const url = await uploadNoteFile(user.college_id, code, f);
          uploadedUrls.push(url);
        }

        path_or_url = uploadedUrls.length === 1 ? uploadedUrls[0] : JSON.stringify(uploadedUrls);

        const kinds = files.map(getFileKind);
        if (kinds.some(k => k === 'pdf')) primaryKind = 'pdf';
        else if (kinds.some(k => k === 'ppt')) primaryKind = 'ppt';
        else if (kinds.some(k => k === 'video')) primaryKind = 'video';
        else primaryKind = 'doc';
      }

      setUploadStatus('Publishing note…');
      await create.mutateAsync({
        college_id: user.college_id,
        subject_id: subjectId,
        title: title.trim(),
        body: body.trim() || null,
        kind: files.length > 0 ? primaryKind : 'note',
        path_or_url
      });

      // Notify students
      const attachInfo = files.length > 1
        ? ` (${files.length} attachments included)`
        : files.length === 1 ? ' (attachment included)' : '';

      await dispatchErpNotification({
        college_id: user.college_id,
        role_scope: 'student',
        type: 'note',
        title: `📖 New Notes: ${title.trim()}`,
        message: `${user?.displayName || 'Faculty'} shared study materials: "${title.trim()}"${attachInfo}.`,
        link: '/notes'
      });

      setOk(true);
      setTimeout(onClose, 700);
    } catch (err: any) {
      setError(err?.message || 'Could not save note.');
    } finally {
      setUploading(false);
      setUploadStatus('');
    }
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
        className="w-full md:w-[540px] rounded-4xl glass p-4 sm:p-5 shadow-hi max-h-[90vh] overflow-auto"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-ios-blue to-ios-purple shadow-sm">
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
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={3}
          className="mt-1 mb-3 w-full rounded-2xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 px-4 py-2.5 text-sm outline-none resize-none"
          placeholder="A short description, key points, or instructions…"/>

        {/* Attachments section with multiple file & image selection */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] uppercase tracking-wider font-semibold opacity-70 flex items-center gap-1.5">
              <Paperclip size={13}/> Attachments {files.length > 0 ? `(${files.length})` : '(optional)'}
            </label>
            {files.length > 0 && (
              <button
                type="button"
                onClick={() => setFiles([])}
                className="text-[11px] text-ios-red hover:underline"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Selected files preview list */}
          {files.length > 0 && (
            <div className="space-y-1.5 mb-2.5 max-h-48 overflow-y-auto pr-1">
              {files.map((file, idx) => {
                const sizeLabel = file.size > 1024 * 1024
                  ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                  : `${Math.round(file.size / 1024)} KB`;

                return (
                  <div
                    key={`${file.name}-${idx}`}
                    className="rounded-xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-white/5 p-2 flex items-center gap-2.5 text-xs shadow-xs"
                  >
                    <FileThumbnail file={file}/>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium clip-1">{file.name}</div>
                      <div className="opacity-60 text-[10px]">{sizeLabel}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="h-7 w-7 rounded-lg hover:bg-ios-red/10 hover:text-ios-red grid place-items-center transition shrink-0 opacity-70 hover:opacity-100"
                      title="Remove file"
                    >
                      <X size={14}/>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Dropzone with multiple option */}
          <label className="w-full rounded-2xl border-2 border-dashed border-white/60 dark:border-white/15 bg-white/60 dark:bg-white/5 p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-ios-blue/60 hover:bg-ios-blue/5 transition text-center group">
            <div className="h-10 w-10 rounded-2xl grid place-items-center text-ios-blue bg-ios-blue/10 group-hover:scale-110 transition shrink-0">
              <UploadCloud size={20}/>
            </div>
            <div className="text-sm font-medium">
              {files.length === 0 ? 'Select files or images' : 'Add more files / images'}
            </div>
            <div className="text-xs opacity-60">
              Select multiple images, PDFs, PPTs, or Docs (max 50 MB each)
            </div>
            <input
              type="file"
              multiple
              accept="application/pdf,.pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,video/*,audio/*,text/plain,.txt,.rtf,application/zip,.zip"
              className="hidden"
              onChange={handleFilesSelected}
            />
          </label>
        </div>

        {error && (
          <div className="mb-3 rounded-2xl border border-ios-red/30 bg-ios-red/10 px-3 py-2.5 text-sm flex items-start gap-2 text-ios-red">
            <AlertCircle size={16} className="mt-0.5 shrink-0"/> <span>{error}</span>
          </div>
        )}
        {ok && (
          <div className="mb-3 rounded-2xl border border-ios-green/30 bg-ios-green/10 px-3 py-2.5 text-sm flex items-start gap-2 text-ios-green">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0"/> Note published successfully.
          </div>
        )}

        <button type="submit" disabled={uploading || create.isPending}
          className="btn-primary w-full disabled:opacity-50">
          {uploading || create.isPending
            ? <><Loader2 size={16} className="animate-spin"/> {uploadStatus || 'Publishing…'}</>
            : <><Send size={16}/> Publish note</>}
        </button>
      </motion.form>
    </motion.div>
  );
}

/* -------------- Thumbnail for selected files -------------- */
function FileThumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImg = file.type.startsWith('image/');

  useEffect(() => {
    if (!isImg) return;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file, isImg]);

  if (isImg && url) {
    return (
      <img
        src={url}
        alt={file.name}
        className="h-9 w-9 rounded-lg object-cover border border-black/10 dark:border-white/10 shrink-0"
      />
    );
  }

  return (
    <div className="h-9 w-9 rounded-lg bg-black/5 dark:bg-white/10 grid place-items-center shrink-0">
      <FileIconForFile file={file}/>
    </div>
  );
}

/* -------------- File-kind helpers -------------- */

function NoteKindIcon({ kind, size = 16 }: { kind: Note['kind']; size?: number }) {
  switch (kind) {
    case 'pdf':   return <FileText size={size}/>;
    case 'ppt':   return <MonitorPlay size={size}/>;
    case 'doc':   return <File size={size}/>;
    case 'video': return <Video size={size}/>;
    default:      return <FileText size={size}/>;
  }
}

function noteKindGradient(kind: Note['kind']): string {
  switch (kind) {
    case 'pdf':   return 'bg-gradient-to-br from-ios-red to-ios-pink';
    case 'ppt':   return 'bg-gradient-to-br from-orange-500 to-red-400';
    case 'doc':   return 'bg-gradient-to-br from-ios-blue to-ios-indigo';
    case 'video': return 'bg-gradient-to-br from-ios-purple to-ios-pink';
    default:      return 'bg-gradient-to-br from-ios-teal to-ios-blue';
  }
}

function noteKindLabel(kind: Note['kind']): string {
  switch (kind) {
    case 'pdf':   return 'PDF';
    case 'ppt':   return 'PPT';
    case 'doc':   return 'DOC';
    case 'video': return 'Video';
    case 'link':  return 'Link';
    case 'note':  return 'Note';
    default:      return 'File';
  }
}

/** Small inline icon shown in the upload dropzone when a file is chosen. */
function FileIconForFile({ file }: { file: File }) {
  const mime = file.type.toLowerCase();
  const ext  = file.name.split('.').pop()?.toLowerCase() || '';
  if (mime.startsWith('image/'))                               return <ImageIcon size={16} className="text-ios-green shrink-0"/>;
  if (mime === 'application/pdf' || ext === 'pdf')             return <FileText size={16} className="text-ios-red shrink-0"/>;
  if (['ppt','pptx'].includes(ext) || mime.includes('presentat')) return <MonitorPlay size={16} className="text-orange-500 shrink-0"/>;
  if (['xls','xlsx','csv'].includes(ext) || mime.includes('spreadsheet') || mime.includes('excel'))
                                                               return <FileSpreadsheet size={16} className="text-ios-green shrink-0"/>;
  if (mime.startsWith('video/'))                               return <Video size={16} className="text-ios-purple shrink-0"/>;
  return <File size={16} className="text-ios-blue shrink-0"/>;
}
