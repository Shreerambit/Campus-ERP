import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, DownloadCloud, GraduationCap, User, Calendar, ClipboardList, Wallet, Bell, Trophy, BookOpen, Building2, Users } from 'lucide-react';
import TenantPicker, { TenantSelection } from '../components/TenantPicker';
import { downloadErrorReport, downloadStudentTemplate, parseFile, validateStudents, ValidatedStudentRow } from '../lib/importUtils';
import { useAuth } from '../lib/auth';
import { HAS_SUPABASE } from '../lib/supabase';
import { upsertStudents } from '../lib/db';

type ImportKind =
  | 'students' | 'teachers' | 'subjects' | 'timetable'
  | 'internal' | 'external' | 'attendance' | 'results'
  | 'cgpa' | 'notices' | 'events' | 'fees';

const KINDS: { id: ImportKind; label: string; icon: React.ComponentType<any>; tone: string; enabled?: boolean }[] = [
  { id: 'students',   label: 'Students',        icon: GraduationCap, tone: 'from-ios-blue to-ios-indigo', enabled: true },
  { id: 'teachers',   label: 'Teachers',        icon: User,          tone: 'from-ios-purple to-ios-pink' },
  { id: 'subjects',   label: 'Subjects',        icon: BookOpen,      tone: 'from-ios-teal to-ios-blue' },
  { id: 'timetable',  label: 'Timetable',       icon: Calendar,      tone: 'from-ios-orange to-ios-red' },
  { id: 'internal',   label: 'Internal Marks',  icon: ClipboardList, tone: 'from-ios-green to-ios-teal' },
  { id: 'external',   label: 'External Marks',  icon: ClipboardList, tone: 'from-ios-purple to-ios-pink' },
  { id: 'attendance', label: 'Attendance',      icon: CheckCircle2,  tone: 'from-ios-blue to-ios-teal' },
  { id: 'results',    label: 'Results',         icon: Trophy,        tone: 'from-ios-orange to-ios-yellow' },
  { id: 'cgpa',       label: 'CGPA',            icon: Trophy,        tone: 'from-ios-purple to-ios-indigo' },
  { id: 'notices',    label: 'Notices',         icon: Bell,          tone: 'from-ios-pink to-ios-red' },
  { id: 'events',     label: 'Events',          icon: Building2,     tone: 'from-ios-teal to-ios-green' },
  { id: 'fees',       label: 'Fees',            icon: Wallet,        tone: 'from-ios-red to-ios-orange' }
];

export default function ImportCenter() {
  const { user } = useAuth();
  const [kind, setKind] = useState<ImportKind>('students');
  const [sel, setSel] = useState<TenantSelection>({});
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ValidatedStudentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'append' | 'upsert'>('upsert');
  const [done, setDone] = useState<null | { added: number; updated: number; skipped: number }>(null);

  const summary = useMemo(() => {
    const valid = rows.filter(r => r.ok).length;
    const errors = rows.length - valid;
    const dup = rows.filter(r => r.errors.includes('Duplicate Registration Number in file')).length;
    return { valid, errors, dup, total: rows.length };
  }, [rows]);

  const canProceed = !!(sel.college && sel.department && sel.course && sel.semester && sel.section);

  const handleFile = async (f: File) => {
    setFile(f); setDone(null); setBusy(true);
    try {
      const parsed = await parseFile(f);
      setRows(validateStudents(parsed));
    } catch (e: any) {
      alert('Could not parse file: ' + (e?.message || e));
    } finally { setBusy(false); }
  };

  const doImport = async () => {
    if (!canProceed || !sel.college || !sel.department || !sel.course || !sel.semester || !sel.section) return;
    const ok = rows.filter(r => r.ok);

    // If Supabase is configured, insert into the DB. Otherwise fall back
    // to the localStorage import store (offline demo mode).
    if (HAS_SUPABASE) {
      try {
        const dbRows = ok.map(r => ({
          college_id:    sel.college!.id,
          department_id: sel.department!.id,
          course_id:     sel.course!.id,
          semester:      sel.semester!.number,
          section:       sel.section!,
          reg_no:        r.reg_no,
          name:          r.name,
          dob:           r.dob || null,
          gender:        r.gender || null,
          personal_email:r.email  || null,
          phone:         r.phone  || null,
          roll_number:   r.roll   || null
        }));
        const res = await upsertStudents(dbRows);
        setDone({ added: res.inserted, updated: 0, skipped: rows.length - ok.length });
        return;
      } catch (err: any) {
        alert('Import failed: ' + (err?.message || err));
        return;
      }
    }

    // Supabase not configured — cannot import.
    alert('Import requires Supabase. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.');
  };

  const reset = () => { setFile(null); setRows([]); setDone(null); };

  return (
    <div className="space-y-6 min-w-0">
      <header className="card">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-ios-blue to-ios-indigo shrink-0">
            <Upload size={18}/>
          </div>
          <div className="min-w-0">
            <div className="h-section">Import Center</div>
            <div className="h-title truncate">Bulk import Excel / CSV data</div>
            <div className="text-xs opacity-60 mt-0.5 truncate">Signed in as {user?.displayName}</div>
          </div>
        </div>
      </header>

      {/* Kind picker */}
      <div className="h-scroll -mx-1 px-1 pb-1 flex gap-2">
        {KINDS.map(k => {
          const active = kind === k.id;
          return (
            <button key={k.id}
              onClick={() => { setKind(k.id); reset(); }}
              className={`h-snap shrink-0 rounded-2xl px-3 py-2.5 text-sm font-semibold border transition flex items-center gap-2
              ${active
                ? 'text-white shadow-hi border-transparent bg-gradient-to-br ' + k.tone
                : 'bg-white/70 dark:bg-white/5 border-white/60 dark:border-white/10 opacity-80'}`}>
              <k.icon size={14}/> {k.label}
              {k.enabled === undefined && <span className="chip !text-[10px] !py-0 opacity-60">Soon</span>}
            </button>
          );
        })}
      </div>

      {kind !== 'students' ? (
        <div className="card">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-ios-orange mt-0.5 shrink-0" size={18}/>
            <div className="min-w-0">
              <div className="font-semibold">This importer is coming next.</div>
              <div className="text-sm opacity-70 mt-1">
                The full architecture (validation, preview, upsert, error report) is already in place. Each type simply plugs into the same flow — <b>Students</b> is enabled today so you can test the pipeline end-to-end.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* 1) Target */}
          <div className="card">
            <div className="h-section mb-2">1 · Choose destination</div>
            <TenantPicker value={sel} onChange={setSel}/>
          </div>

          {/* 2) File */}
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="h-section">2 · Upload students file</div>
              <button onClick={downloadStudentTemplate} className="chip !text-ios-blue">
                <DownloadCloud size={12}/> Download template
              </button>
            </div>

            <label className="block rounded-3xl border-2 border-dashed border-black/10 dark:border-white/15 bg-white/40 dark:bg-white/[0.03] p-6 sm:p-8 text-center cursor-pointer hover:bg-white/60 transition">
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}/>
              <FileSpreadsheet className="mx-auto text-ios-blue" size={28}/>
              <div className="mt-2 font-semibold text-sm sm:text-base">
                {file ? file.name : 'Click to choose an Excel / CSV file'}
              </div>
              <div className="text-xs opacity-60 mt-1">Accepted: .xlsx · .xls · .csv — supports thousands of rows.</div>
            </label>

            {busy && <div className="mt-3 text-sm opacity-70">Parsing…</div>}
          </div>

          {/* 3) Preview */}
          {rows.length > 0 && (
            <div className="card">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="h-section">3 · Preview & validate</div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <StatChip color="text-ios-blue"  label="Total"    value={summary.total}/>
                  <StatChip color="text-ios-green" label="Valid"    value={summary.valid}/>
                  <StatChip color="text-ios-red"   label="Errors"   value={summary.errors}/>
                  <StatChip color="text-ios-orange"label="Duplicate"value={summary.dup}/>
                  {summary.errors > 0 && (
                    <button onClick={() => downloadErrorReport(rows)} className="chip">
                      <DownloadCloud size={12}/> Error report
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-sm min-w-[720px]">
                  <thead className="text-[11px] uppercase tracking-wider opacity-60 font-semibold">
                    <tr className="text-left">
                      <th className="py-2 pr-3">#</th>
                      <th className="py-2 pr-3">Reg No</th>
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">DOB</th>
                      <th className="py-2 pr-3">Roll</th>
                      <th className="py-2 pr-3">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 200).map((r, i) => (
                      <tr key={i} className={`hairline ${r.ok ? '' : 'bg-ios-red/5'}`}>
                        <td className="py-2 pr-3 opacity-60 tabular-nums">{i + 1}</td>
                        <td className="py-2 pr-3 font-mono">{r.reg_no || '—'}</td>
                        <td className="py-2 pr-3">{r.name || <span className="opacity-40">—</span>}</td>
                        <td className="py-2 pr-3 tabular-nums">{r.dob || <span className="opacity-40">—</span>}</td>
                        <td className="py-2 pr-3 tabular-nums">{r.roll ?? ''}</td>
                        <td className="py-2 pr-3 text-ios-red text-[12px]">{r.errors.join('; ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 200 && <div className="text-xs opacity-60 mt-2">Showing first 200 of {rows.length} rows.</div>}
              </div>

              <div className="hairline my-4"/>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs opacity-70">Mode:</span>
                <button onClick={() => setMode('append')}
                  className={`chip ${mode === 'append' ? 'text-white bg-gradient-to-br from-ios-blue to-ios-indigo' : ''}`}>Append only</button>
                <button onClick={() => setMode('upsert')}
                  className={`chip ${mode === 'upsert' ? 'text-white bg-gradient-to-br from-ios-blue to-ios-indigo' : ''}`}>Upsert (update if exists)</button>

                <button
                  onClick={doImport}
                  disabled={!canProceed || summary.valid === 0}
                  className="btn-primary ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Users size={16}/> Import {summary.valid} student{summary.valid === 1 ? '' : 's'}
                </button>
              </div>

              {!canProceed && (
                <div className="mt-3 text-[12px] text-ios-orange flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5"/> Please choose the full destination (college → dept → course → semester → section) before importing.
                </div>
              )}
            </div>
          )}

          {done && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="card border-ios-green/40 bg-ios-green/10">
              <div className="flex items-center gap-2 font-semibold text-ios-green">
                <CheckCircle2 size={18}/> Import complete
              </div>
              <div className="text-sm mt-1 opacity-80">
                Added: <b>{done.added}</b> · Updated: <b>{done.updated}</b> · Skipped: <b>{done.skipped}</b>.
                Students are now live — leaderboard, directory and search reflect the new roster.
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={reset} className="btn-ghost">Import another file</button>
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className={`chip ${color}`}>
      ● {label}: <b className="ml-1 tabular-nums">{value}</b>
    </span>
  );
}
