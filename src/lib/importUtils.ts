import * as XLSX from 'xlsx';

export type ParsedRow = Record<string, string | number | undefined>;

export async function parseFile(file: File): Promise<ParsedRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const first = wb.SheetNames[0];
  const ws = wb.Sheets[first];
  const rows = XLSX.utils.sheet_to_json<ParsedRow>(ws, { defval: '' });
  return rows.map(normalizeRow);
}

function normalizeRow(r: ParsedRow): ParsedRow {
  const out: ParsedRow = {};
  for (const [k, v] of Object.entries(r)) {
    const key = String(k).trim().toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '');
    out[key] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

export type ValidatedStudentRow = {
  ok: boolean;
  errors: string[];
  reg_no: string;
  name: string;
  dob?: string;
  gender?: string;
  email?: string;
  phone?: string;
  roll?: number;
};

function normalizeDob(v: any): string | undefined {
  if (!v && v !== 0) return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const s = String(v).trim();
  if (!s) return undefined;
  // yyyy-mm-dd
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  // dd/mm/yyyy or dd-mm-yyyy
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m1) {
    let [_, d, m, y] = m1;
    if (y.length === 2) y = '20' + y;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  return undefined;
}

export function validateStudents(rows: ParsedRow[]): ValidatedStudentRow[] {
  const seen = new Set<string>();
  return rows.map((r, idx) => {
    const errors: string[] = [];
    const reg = String(r.reg_no ?? r.registration_number ?? r.usn ?? r.regno ?? '').trim().toUpperCase();
    const name = String(r.name ?? r.student_name ?? r.full_name ?? '').trim();
    const dob = normalizeDob(r.dob ?? r.date_of_birth ?? r.dateofbirth);
    const gender = String(r.gender ?? '').trim();
    const email = String(r.email ?? r.personal_email ?? '').trim();
    const phone = String(r.phone ?? r.mobile ?? '').trim();
    const roll = Number(r.roll ?? r.roll_number ?? idx + 1);

    if (!reg) errors.push('Missing Registration Number');
    if (!name) errors.push('Missing Name');
    if (r.dob && !dob) errors.push('Invalid Date of Birth (use yyyy-mm-dd or dd/mm/yyyy)');
    if (seen.has(reg)) errors.push('Duplicate Registration Number in file');
    seen.add(reg);

    return { ok: errors.length === 0, errors, reg_no: reg, name, dob, gender, email, phone, roll: isNaN(roll) ? undefined : roll };
  });
}

/* Download a sample CSV template for the Import Center */
export function downloadStudentTemplate() {
  const rows = [
    { reg_no: 'U26ZW24S0001', name: 'Shivanand R Kanni', dob: '2006-09-23', gender: 'Male',   email: 'demo@bvvs.edu.in', phone: '9000000000', roll: 1 },
    { reg_no: 'U26ZW24S0002', name: 'Siddarth',          dob: '2006-04-12', gender: 'Male',   email: '',                  phone: '',           roll: 2 },
    { reg_no: 'U26ZW24S0003', name: 'Basavaraj Hokrani', dob: '05/11/2006', gender: 'Male',   email: '',                  phone: '',           roll: 3 }
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Students');
  XLSX.writeFile(wb, 'students-template.xlsx');
}

/* Turn a preview into a downloadable error report */
export function downloadErrorReport(rows: ValidatedStudentRow[]) {
  const errored = rows.filter(r => !r.ok).map((r, i) => ({
    row: i + 1, reg_no: r.reg_no, name: r.name, errors: r.errors.join('; ')
  }));
  const ws = XLSX.utils.json_to_sheet(errored);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Errors');
  XLSX.writeFile(wb, 'import-errors.xlsx');
}
