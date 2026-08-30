import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nzxbitngtkjeduwhueks.supabase.co',
  'sb_publishable_ULJv7aBi_GsDNuQ-Cxpcbg_w9KngS3h'
);

const COLLEGE = '11111111-1111-1111-1111-111111111111';
const DEPT    = 'aaaaaaaa-0001-0000-0000-000000000001';

// Step 1: Find Shreeram
const { data: student } = await supabase
  .from('students').select('id, name, reg_no')
  .eq('college_id', COLLEGE).ilike('reg_no', 'U26ZW24S0230').maybeSingle();

console.log('Student:', student?.name, student?.id);
if (!student?.id) { console.log('Not found'); process.exit(1); }

// Step 2: Upsert missing Sem 4 subjects
const sem4Subjects = [
  { code: '2E4XXXM11T', name: 'Web Technology',                semester: 4, credits: 4 },
  { code: '2E4XXXM11L', name: 'Web Technology Lab',            semester: 4, credits: 2 },
  { code: '2E4XXXM10T', name: 'Python Programming',            semester: 4, credits: 4 },
  { code: '2E4XXXM10L', name: 'Python Programming Lab',        semester: 4, credits: 2 },
  { code: '2E4XXXM12T', name: 'Operating System Concepts',     semester: 4, credits: 4 },
  { code: '2S4XXXS01T', name: 'Artificial Intelligence for All', semester: 4, credits: 2 },
  { code: '2E4XXXE06T', name: 'Unix Operating System',         semester: 4, credits: 3 },
];

const { error: subErr } = await supabase.from('subjects').upsert(
  sem4Subjects.map(s => ({ college_id: COLLEGE, department_id: DEPT, ...s })),
  { onConflict: 'college_id,code' }
);
console.log('Subjects upsert:', subErr?.message ?? 'OK');

// Step 3: Fetch subject IDs
const codes = sem4Subjects.map(s => s.code);
const { data: subjects } = await supabase.from('subjects')
  .select('id, code').eq('college_id', COLLEGE).in('code', codes);

const subjectMap = Object.fromEntries((subjects || []).map(s => [s.code, s.id]));
console.log('Subjects found:', Object.keys(subjectMap).length);

// Step 4: Insert marks — Web Technology 92/100 = 19+73
const marksData = [
  { code: '2E4XXXM11T', kind: 'internal', score: 19, max_score: 20 },
  { code: '2E4XXXM11T', kind: 'external', score: 73, max_score: 80 },
  { code: '2E4XXXM11L', kind: 'internal', score: 9,  max_score: 10 },
  { code: '2E4XXXM11L', kind: 'external', score: 37, max_score: 40 },
  { code: '2E4XXXM10T', kind: 'internal', score: 17, max_score: 20 },
  { code: '2E4XXXM10T', kind: 'external', score: 58, max_score: 80 },
  { code: '2E4XXXM10L', kind: 'internal', score: 8,  max_score: 10 },
  { code: '2E4XXXM10L', kind: 'external', score: 33, max_score: 40 },
  { code: '2E4XXXM12T', kind: 'internal', score: 15, max_score: 20 },
  { code: '2E4XXXM12T', kind: 'external', score: 52, max_score: 80 },
];

const toInsert = marksData
  .filter(m => subjectMap[m.code])
  .map(m => ({
    college_id: COLLEGE,
    student_id: student.id,
    subject_id: subjectMap[m.code],
    kind: m.kind,
    score: m.score,
    max_score: m.max_score,
  }));

console.log('Inserting', toInsert.length, 'rows...');
const { data: inserted, error: mErr } = await supabase
  .from('marks')
  .upsert(toInsert, { onConflict: 'student_id,subject_id,kind' })
  .select('subject_id, kind, score, max_score');

console.log('Error:', mErr?.message ?? 'none');
console.log('Rows:', inserted?.length ?? 0);

// Show Web Technology result
const webId = subjectMap['2E4XXXM11T'];
if (webId && inserted) {
  const rows = inserted.filter(r => r.subject_id === webId);
  const total = rows.reduce((s, r) => s + Number(r.score), 0);
  const max   = rows.reduce((s, r) => s + Number(r.max_score), 0);
  console.log(`Web Technology: ${total}/${max} = ${(total/max*100).toFixed(1)}%`);
}
