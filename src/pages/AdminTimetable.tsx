import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CalendarDays, Upload, DownloadCloud, CheckCircle2, AlertCircle, Loader2, FileSpreadsheet
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useTenant } from '../lib/tenant';
import { parseFile } from '../lib/importUtils';
import { uploadTimetable, UploadedSlot } from '../lib/liveData';
import * as XLSX from 'xlsx';

const DAY_MAP: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6
};

function toDow(v: any): number | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return null;
  if (/^[0-9]+$/.test(s)) { const n = Number(s); return n >= 0 && n <= 7 ? (n === 7 ? 0 : n) : null; }
  return DAY_MAP[s.slice(0, 3)] ?? DAY_MAP[s] ?? null;
}
function toTime(v: any): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  // Excel numeric time (fraction of day)
  if (!isNaN(+s) && +s < 1) {
    const total = Math.round(+s * 24 * 60);
    const hh = Math.floor(total / 60), mm = total % 60;
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00`;
  }
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let hh = Number(m[1]), mm = Number(m[2]);
  if (m[4]?.toLowerCase() === 'pm' && hh < 12) hh += 12;
  if (m[4]?.toLowerCase() === 'am' && hh === 12) hh = 0;
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00`;
}

type Preview = { row: UploadedSlot | null; errors: string[]; raw: Record<string, any> };

export default function AdminTimetable() {
  const { user } = useAuth();
  const { findCollege } = useTenant();
  const college = user?.college_id ? findCollege(user.college_id) : undefined;

  const departments = college?.departments ?? [];
  const [deptId, setDeptId] = useState(departments[0]?.id ?? '');
  const dept = departments.find(d => d.id === deptId);
  const courses = dept?.courses ?? [];
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');

  const [file, setFile] = useState<File | null>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [replace, setReplace] = useState(true);

  const summary = useMemo(() => {
    const valid = previews.filter(p => p.errors.length === 0).length;
    return { total: previews.length, valid, errors: previews.length - valid };
  }, [previews]);

  if (!user || (user.role !== 'admin' && user.role !== 'super')) {
    return <div className="card"><div className="h-title">Access denied</div><p className="text-sm opacity-70 mt-1">Only College Admin or Super Admin can upload timetables.</p></div>;
  }

  const handleFile = async (f: File) => {
    setFile(f); setMsg({}); setBusy(true);
    try {
      const raw = await parseFile(f);
      const rows: Preview[] = raw.map(r => {
        const dow = toDow(r.day || r.day_of_week || r.weekday);
        const start = toTime(r.start_time || r.from || r.start);
        const end   = toTime(r.end_time   || r.to   || r.end);
        const sem   = Number(r.semester || r.sem || 0);
        const section = String(r.section || '').trim().toUpperCase();
        const subject_code = String(r.subject_code || r.code || '').trim();
        const subject_name = String(r.subject_name || r.subject || r.name || '').trim();
        const teacher = String(r.teacher || r.teacher_username || r.faculty || '').trim();
        const room = String(r.room || r.classroom || '').trim();
        const slot_type = ((r.slot_type || r.type || 'Lecture') as string).trim();

        const errors: string[] = [];
        if (dow === null)      errors.push('Invalid day (use Mon/Tue/Wed…)');
        if (!start)            errors.push('Invalid start_time (use HH:MM)');
        if (!end)              errors.push('Invalid end_time (use HH:MM)');
        if (!sem || sem < 1)   errors.push('Missing semester');
        if (!section)          errors.push('Missing section');
        if (!subject_code)     errors.push('Missing subject_code');

        return {
          errors,
          raw: r,
          row: errors.length ? null : {
            day_of_week: dow!, start_time: start!, end_time: end!,
            semester: sem, section, subject_code, subject_name,
            teacher, room, slot_type: (['Lecture','Lab','Tutorial'].includes(slot_type) ? slot_type : 'Lecture') as any
          }
        };
      });
      setPreviews(rows);
    } catch (e: any) {
      setMsg({ err: e?.message || String(e) });
    } finally { setBusy(false); }
  };

  const doUpload = async () => {
    if (!user?.college_id || !courseId) return;
    const ok = previews.filter(p => p.row).map(p => p.row!);
    if (ok.length === 0) return setMsg({ err: 'Nothing to upload — fix errors first.' });
    setBusy(true); setMsg({});
    try {
      const res = await uploadTimetable(user.college_id, courseId, ok, replace);
      setMsg({ ok: `Inserted ${res.inserted} slots · Skipped ${res.skipped} (unknown section).` });
      setPreviews([]); setFile(null);
    } catch (e: any) {
      setMsg({ err: e?.message || String(e) });
    } finally { setBusy(false); }
  };

  const downloadTemplate = () => {
    const rows = [
      { day: 'Monday',    start_time: '09:00', end_time: '10:00', semester: 5, section: 'A', subject_code: 'BCA501', subject_name: 'Software Engineering', teacher: 'praveen',   room: '204',   slot_type: 'Lecture' },
      { day: 'Monday',    start_time: '10:00', end_time: '11:00', semester: 5, section: 'A', subject_code: 'BCA502', subject_name: 'Data Analytics',      teacher: 'naina',     room: '204',   slot_type: 'Lecture' },
      { day: 'Monday',    start_time: '11:15', end_time: '13:15', semester: 5, section: 'A', subject_code: 'BCA503L', subject_name: 'Python Lab',        teacher: 'akshat',    room: 'Lab-1', slot_type: 'Lab' },
      { day: 'Monday',    start_time: '09:00', end_time: '10:00', semester: 5, section: 'B', subject_code: 'BCA502', subject_name: 'Data Analytics',      teacher: 'naina',     room: '205',   slot_type: 'Lecture' }
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Timetable');
    XLSX.writeFile(wb, 'timetable-template.xlsx');
  };

  return (
    <div className="space-y-4 min-w-0">
      <header className="card">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-ios-blue to-ios-indigo shrink-0">
            <CalendarDays size={18}/>
          </div>
          <div className="min-w-0 flex-1">
            <div className="h-section">Timetable Upload</div>
            <div className="h-title truncate">{college?.short ?? 'Your college'}</div>
          </div>
          <button onClick={downloadTemplate} className="chip !text-ios-blue">
            <DownloadCloud size={12}/> Template
          </button>
        </div>
      </header>

      {/* 1) target */}
      <section className="card">
        <div className="h-section mb-2">1 · Target</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider opacity-60 font-semibold">Department</label>
            <select value={deptId} onChange={e => setDeptId(e.target.value)}
              className="mt-1 w-full input">
              {departments.map(d => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider opacity-60 font-semibold">Course</label>
            <select value={courseId} onChange={e => setCourseId(e.target.value)}
              className="mt-1 w-full input">
              {courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* 2) file */}
      <section className="card">
        <div className="h-section mb-2">2 · Upload timetable file</div>
        <label className="block rounded-3xl border-2 border-dashed border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/[0.03] p-6 sm:p-8 text-center cursor-pointer hover:bg-white/60 transition">
          <input type="file" accept=".csv,.xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}/>
          <FileSpreadsheet className="mx-auto text-ios-blue" size={28}/>
          <div className="mt-2 font-semibold text-sm sm:text-base">
            {file ? file.name : 'Click to choose a CSV / XLSX'}
          </div>
          <div className="text-xs opacity-60 mt-1">Columns: day, start_time, end_time, semester, section, subject_code, subject_name, teacher, room, slot_type</div>
        </label>
        <label className="mt-3 inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)}
            className="h-4 w-4 rounded accent-ios-blue"/>
          Replace existing timetable for this course
        </label>
      </section>

      {/* 3) preview */}
      {previews.length > 0 && (
        <section className="card">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="h-section">3 · Preview & validate</div>
            <div className="ml-auto flex gap-2">
              <span className="chip text-ios-blue">Total: <b className="ml-1">{summary.total}</b></span>
              <span className="chip text-ios-green">Valid: <b className="ml-1">{summary.valid}</b></span>
              <span className="chip text-ios-red">Errors: <b className="ml-1">{summary.errors}</b></span>
            </div>
          </div>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm min-w-[820px]">
              <thead className="text-[11px] uppercase tracking-wider opacity-60 font-semibold">
                <tr className="text-left border-b border-black/5 dark:border-white/10">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Day</th>
                  <th className="py-2 pr-2">Time</th>
                  <th className="py-2 pr-2">Sem</th>
                  <th className="py-2 pr-2">Sec</th>
                  <th className="py-2 pr-2">Subject</th>
                  <th className="py-2 pr-2">Teacher</th>
                  <th className="py-2 pr-2">Room</th>
                  <th className="py-2 pr-2">Type</th>
                  <th className="py-2 pr-2">Errors</th>
                </tr>
              </thead>
              <tbody>
                {previews.slice(0, 200).map((p, i) => (
                  <tr key={i} className={`hairline ${p.errors.length ? 'bg-ios-red/5' : ''}`}>
                    <td className="py-2 pr-2 opacity-60">{i + 1}</td>
                    <td className="py-2 pr-2">{p.row ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][p.row.day_of_week] : (p.raw.day ?? '—')}</td>
                    <td className="py-2 pr-2 tabular-nums">{p.row ? `${p.row.start_time.slice(0,5)}–${p.row.end_time.slice(0,5)}` : ''}</td>
                    <td className="py-2 pr-2 tabular-nums">{p.row?.semester ?? p.raw.semester}</td>
                    <td className="py-2 pr-2">{p.row?.section ?? p.raw.section}</td>
                    <td className="py-2 pr-2 clip-1">{p.row?.subject_code ?? p.raw.subject_code} · {p.row?.subject_name ?? p.raw.subject_name}</td>
                    <td className="py-2 pr-2">{p.row?.teacher ?? p.raw.teacher}</td>
                    <td className="py-2 pr-2">{p.row?.room ?? p.raw.room}</td>
                    <td className="py-2 pr-2">{p.row?.slot_type ?? p.raw.slot_type ?? 'Lecture'}</td>
                    <td className="py-2 pr-2 text-ios-red text-[12px]">{p.errors.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {previews.length > 200 && <div className="text-xs opacity-60 mt-2">Showing first 200 of {previews.length} rows.</div>}
          </div>

          {msg.err && <div className="mt-3 rounded-2xl border border-ios-red/30 bg-ios-red/10 px-3 py-2 text-sm flex items-start gap-2 text-ios-red">
            <AlertCircle size={16} className="mt-0.5 shrink-0"/> {msg.err}
          </div>}
          {msg.ok && <div className="mt-3 rounded-2xl border border-ios-green/30 bg-ios-green/10 px-3 py-2 text-sm flex items-start gap-2 text-ios-green">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0"/> {msg.ok}
          </div>}

          <div className="mt-4 flex justify-end">
            <button onClick={doUpload} disabled={busy || summary.valid === 0}
              className="btn-primary disabled:opacity-60">
              {busy ? <Loader2 size={16} className="animate-spin"/> : <Upload size={16}/>}
              Upload {summary.valid} slots to Supabase
            </button>
          </div>
        </section>
      )}

      <style>{`.input{padding:.55rem .7rem;border-radius:.9rem;background:rgba(255,255,255,.7);border:1px solid rgba(255,255,255,.6);font-size:14px;outline:none;width:100%}
        html.dark .input{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.1);color:#fff}`}</style>
    </div>
  );
}
