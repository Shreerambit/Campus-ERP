/**
 * ERP AI Client — Full ChatGPT-like AI Academic & General Intelligence Assistant.
 *
 * Features:
 * - Answers ANY question (coding, syllabus, model questions, general knowledge, math, essay writing, study tips).
 * - Has full background awareness of the student's real academic record (CGPA, SGPA, marks, weak subjects, notes).
 * - Provides natural, concise, or detailed ChatGPT-style answers with fast streaming.
 */
import { supabase, HAS_SUPABASE } from './supabase';

export interface AcademicSnapshot {
  student: {
    name: string;
    reg_no: string;
    roll: string;
    course: string;
    department: string;
    semester: number;
    section: string;
    admission_year: number | null;
    gender: string | null;
  };
  cgpa: number | null;
  /** SGPA of the most recently COMPLETED semester (e.g. Sem 4 SGPA, not the current ongoing Sem 5) */
  current_sgpa: number | null;
  /** Semester number of the last completed semester (e.g. 4) */
  _last_sem_no?: number;
  /** How many semesters have been completed (with final results) */
  _completed_count?: number;
  /** SGPA of the CURRENT ongoing semester, if finalized mid-term; null if not yet available */
  _ongoing_sem_sgpa?: number | null;
  semesters: { semester: number; sgpa: number | null; cgpa: number | null }[];
  subjects: {
    id: string;
    code: string;
    name: string;
    semester: number | null;
    credits: number;
    internal: number | null;
    internal_max: number | null;
    external: number | null;
    external_max: number | null;
    total: number | null;
    total_max: number | null;
    percent: number | null;
    grade: string | null;
    attendance: { present: number; absent: number; leave: number; total: number; pct: number } | null;
    is_backlog: boolean;
  }[];
  overall_attendance: { present: number; absent: number; leave: number; total: number; pct: number } | null;
  backlogs: { code: string; name: string; semester: number | null; total: number | null; pct: number | null }[];
  weak_subjects: { code: string; name: string; pct: number; reason: string }[];
  strong_subjects: { code: string; name: string; pct: number }[];
  recent_notes: { id: string; title: string; subject_code: string | null; subject_name: string | null; created_at: string }[];
  today_timetable: { time: string; subject_code: string | null; subject_name: string | null; teacher: string | null; room: string | null; type: string | null }[];
}

export type AiSnapshot = AcademicSnapshot;

export type ChatDelta =
  | { type: 'meta'; conversation_id: string; student_name: string }
  | { type: 'delta'; text: string }
  | { type: 'error'; message: string };

const GROQ_KEY = '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';
const GROQ_MODELS = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];

function letterGrade(percent: number): string {
  if (percent >= 90) return 'O';
  if (percent >= 80) return 'A+';
  if (percent >= 70) return 'A';
  if (percent >= 60) return 'B+';
  if (percent >= 50) return 'B';
  if (percent >= 45) return 'C';
  if (percent >= 40) return 'P';
  return 'F';
}

/** Builds academic snapshot from database */
export async function fetchSnapshot(signal?: AbortSignal): Promise<AiSnapshot> {
  if (!HAS_SUPABASE || !supabase) throw new Error('Supabase not configured.');

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  let studentRow: any = null;
  if (userId) {
    const { data } = await supabase
      .from('students')
      .select('*')
      .eq('auth_user_id', userId)
      .maybeSingle();
    studentRow = data;
  }

  if (!studentRow) {
    const raw = sessionStorage.getItem('campus.session.v3') || localStorage.getItem('campus.session.v3');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.id && parsed.college_id) {
          const { data } = await supabase
            .from('students')
            .select('*')
            .eq('college_id', parsed.college_id)
            .ilike('reg_no', parsed.id)
            .maybeSingle();
          studentRow = data;
        }
      } catch { /* ignore */ }
    }
  }

  if (!studentRow) {
    studentRow = {
      id: '90ac83bb-035e-4e34-af2e-6c6e79ce995d',
      college_id: '11111111-1111-1111-1111-111111111111',
      name: 'Shreeram Krishnappa Bhajantri',
      reg_no: 'U26ZW24S0230',
      semester: 5,
      section: 'A',
      cgpa: 6.89,
      sgpa: 8.33,
    };
  }

  const collegeId = studentRow.college_id;
  const studentId = studentRow.id;

  const [courseRes, deptRes, subjsRes, marksRes, resultsRes, attViewRes, attRowsRes, notesRes] = await Promise.all([
    supabase.from('courses').select('code').eq('id', studentRow.course_id).maybeSingle(),
    supabase.from('departments').select('code').eq('id', studentRow.department_id).maybeSingle(),
    supabase.from('subjects').select('id, code, name, semester, credits').eq('college_id', collegeId),
    supabase.from('marks').select('subject_id, kind, score, max_score').eq('student_id', studentId).eq('college_id', collegeId),
    supabase.from('results').select('semester, sgpa, cgpa').eq('student_id', studentId).eq('college_id', collegeId).order('semester'),
    supabase.from('v_student_attendance').select('present, total, pct').eq('student_id', studentId).maybeSingle(),
    supabase.from('attendance').select('subject_id, status').eq('student_id', studentId),
    supabase.from('study_materials').select('id, title, created_at, subject:subject_id(code, name)').eq('college_id', collegeId).order('created_at', { ascending: false }).limit(10),
  ]);

  const subjects = subjsRes.data || [];
  const marks = marksRes.data || [];
  const results = resultsRes.data || [];
  const attView = attViewRes.data;
  const attRows = attRowsRes.data || [];
  const notes = notesRes.data || [];

  const attMap = new Map<string, { present: number; absent: number; leave: number; total: number }>();
  for (const a of attRows) {
    const cur = attMap.get(a.subject_id) || { present: 0, absent: 0, leave: 0, total: 0 };
    cur.total++;
    if (a.status === 'present') cur.present++;
    else if (a.status === 'absent') cur.absent++;
    else if (a.status === 'leave') cur.leave++;
    attMap.set(a.subject_id, cur);
  }

  const marksBySubj = new Map<string, { internal: number; internalMax: number; external: number; externalMax: number }>();
  for (const m of marks) {
    const cur = marksBySubj.get(m.subject_id) || { internal: 0, internalMax: 0, external: 0, externalMax: 0 };
    if (m.kind === 'internal' || m.kind === 'lab' || m.kind === 'practical' || m.kind === 'project') {
      cur.internal += Number(m.score || 0);
      cur.internalMax += Number(m.max_score || 0);
    } else if (m.kind === 'external') {
      cur.external += Number(m.score || 0);
      cur.externalMax += Number(m.max_score || 0);
    }
    marksBySubj.set(m.subject_id, cur);
  }

  const subjOut: AcademicSnapshot['subjects'] = [];
  for (const s of subjects) {
    const m = marksBySubj.get(s.id);
    const internal = m?.internal ?? null;
    const internal_max = m?.internalMax ?? null;
    const external = m?.external ?? null;
    const external_max = m?.externalMax ?? null;
    const total = internal != null && external != null ? internal + external : internal != null ? internal : null;
    const total_max = internal_max != null && external_max != null ? internal_max + external_max : internal_max != null ? internal_max : null;
    const percent = total != null && total_max ? Math.round((total / total_max) * 1000) / 10 : null;
    const a = attMap.get(s.id) || null;
    const attSummary = a ? { present: a.present, absent: a.absent, leave: a.leave, total: a.total, pct: Math.round(((a.present + a.leave) / Math.max(a.total, 1)) * 1000) / 10 } : null;
    const is_backlog = percent != null && percent < 40;
    subjOut.push({
      id: s.id,
      code: s.code,
      name: s.name,
      semester: s.semester,
      credits: s.credits,
      internal,
      internal_max,
      external,
      external_max,
      total,
      total_max,
      percent,
      grade: percent != null ? letterGrade(percent) : null,
      attendance: attSummary,
      is_backlog,
    });
  }

  const sortedResults = results.slice().sort((a, b) => a.semester - b.semester);
  const current_sem = studentRow.semester ?? 5;

  // Only semesters BEFORE the current one are "completed" — the current sem is ongoing
  const completedResults = sortedResults.filter(r => r.semester < current_sem && r.sgpa != null);
  const completedCount = completedResults.length;

  // CGPA = average of completed semesters (not including current ongoing sem)
  let cgpa: number | null = null;
  if (completedCount > 0) {
    cgpa = +(completedResults.reduce((a, r) => a + Number(r.sgpa), 0) / completedCount).toFixed(2);
  }
  if (cgpa == null) cgpa = studentRow.cgpa ?? 6.89;

  // Last completed semester's SGPA (e.g. Sem 4 = 8.33)
  const lastCompletedRes = completedResults[completedResults.length - 1];
  const last_sem_sgpa = lastCompletedRes?.sgpa ? +Number(lastCompletedRes.sgpa).toFixed(2) : null;
  const last_sem_no = lastCompletedRes?.semester ?? (current_sem - 1);

  // current_sgpa: only if the DB has a result for current sem (mid-sem or finalized)
  const currentSemRes = sortedResults.find(r => r.semester === current_sem);
  const current_sgpa = currentSemRes?.sgpa ? +Number(currentSemRes.sgpa).toFixed(2) : null;

  const backlogs = subjOut.filter(s => s.is_backlog).map(s => ({ code: s.code, name: s.name, semester: s.semester, total: s.total, pct: s.percent }));
  const graded = subjOut.filter(s => s.percent != null);
  const weak_subjects = graded.filter(s => s.percent! >= 40 && s.percent! < 55).map(s => ({
    code: s.code,
    name: s.name,
    pct: s.percent!,
    reason: `Scored ${s.percent}%`,
  }));
  const strong_subjects = graded.filter(s => s.percent! >= 75).map(s => ({ code: s.code, name: s.name, pct: s.percent! }));

  const recent_notes = notes.map((n: any) => ({
    id: n.id,
    title: n.title,
    created_at: n.created_at,
    subject_code: n.subject?.code ?? null,
    subject_name: n.subject?.name ?? null,
  }));

  return {
    student: {
      name: studentRow.name ?? 'Shreeram Krishnappa Bhajantri',
      reg_no: studentRow.reg_no ?? 'U26ZW24S0230',
      roll: String(studentRow.reg_no ?? '').slice(-3),
      course: courseRes.data?.code ?? 'BCA',
      department: deptRes.data?.code ?? 'UG',
      semester: current_sem ?? 5,
      section: studentRow.section ?? 'A',
      admission_year: studentRow.admission_year ?? null,
      gender: studentRow.gender ?? null,
    },
    cgpa,
    // current_sgpa reflects last COMPLETED semester's SGPA (not the ongoing sem)
    current_sgpa: last_sem_sgpa ?? current_sgpa,
    // Extra metadata for prompt accuracy
    _last_sem_no: last_sem_no,
    _completed_count: completedCount,
    _ongoing_sem_sgpa: current_sgpa, // null if sem 5 not yet finalized
    semesters: sortedResults,
    subjects: subjOut,
    overall_attendance: attView ? {
      present: Number(attView.present ?? 0),
      absent: Math.max(0, Number(attView.total ?? 0) - Number(attView.present ?? 0)),
      leave: 0,
      total: Number(attView.total ?? 0),
      pct: Math.round(Number(attView.pct ?? 0) * 10) / 10,
    } : null,
    backlogs,
    weak_subjects,
    strong_subjects,
    recent_notes,
    today_timetable: [],
  };
}

export function cgpaTargetPlan(cgpaNow: number | null, completedSems: number, remainingSems: number, target: number) {
  if (cgpaNow == null) return null;
  if (remainingSems <= 0) return { feasible: false, reason: 'No remaining semesters.' };
  const needed = (target * (completedSems + remainingSems) - cgpaNow * completedSems) / remainingSems;
  const maxPossible = +((cgpaNow * completedSems + 10 * remainingSems) / (completedSems + remainingSems)).toFixed(2);
  const feasible = needed <= 10 && needed >= 0;
  return {
    feasible,
    current_cgpa: cgpaNow,
    target,
    completed_semesters: completedSems,
    remaining_semesters: remainingSems,
    required_sgpa_per_sem: +needed.toFixed(2),
    max_possible: maxPossible,
  };
}

export async function fetchCgpaPlan(target: number, signal?: AbortSignal): Promise<{ snapshot: AiSnapshot; plan: any }> {
  const snapshot = await fetchSnapshot(signal);
  // Completed semesters = semesters with final SGPA, NOT including the current ongoing sem
  const completedSems = snapshot._completed_count ?? Math.max(1, (snapshot.student.semester || 1) - 1);
  const totalSems = 6;
  const remaining = Math.max(1, totalSems - completedSems);
  const plan = cgpaTargetPlan(snapshot.cgpa, completedSems, remaining, target);
  return { snapshot, plan };
}

/** Builds comprehensive ChatGPT-style system prompt */
function buildSystemPrompt(snap: AiSnapshot): string {
  const name = snap.student.name;
  const sem = snap.student.semester;         // Current ongoing semester (5)
  const cgpa = snap.cgpa?.toFixed(2) ?? '6.89';
  const completedSems = snap._completed_count ?? 4;  // How many sems have final results
  const totalSems = 6;
  const remainingSems = totalSems - completedSems;   // Sems 5 & 6 still to go
  const lastSemNo = snap._last_sem_no ?? (sem - 1);  // e.g. 4
  const lastSemSgpa = snap.current_sgpa?.toFixed(2) ?? '8.33'; // Sem 4 SGPA
  const gradePointsSoFar = (Number(cgpa) * completedSems).toFixed(2); // 4 × 6.89 = 27.56

  // Max CGPA possible: completed grade points + 10.0 for each remaining sem / 6
  const maxPossible = +((Number(cgpa) * completedSems + 10 * remainingSems) / totalSems).toFixed(2);

  // For the math example in the prompt
  const exampleWith99 = +((Number(cgpa) * completedSems + 9.9 + 9.9) / totalSems).toFixed(2);

  return `You are ERP AI — a fully-capable, unrestricted academic AI assistant embedded inside the Campus ERP system of B.V.V.S. Basaveshwar Science College, Bagalkote (Bagalkot University). You know everything about the college, its students, teachers, subjects, and exam patterns. You also have general AI knowledge (like ChatGPT) to answer ANY question.

━━━ STUDENT PROFILE ━━━
- Name: ${name} (Reg No: ${snap.student.reg_no}, Roll: ${snap.student.roll})
- Course: BCA | Semester: ${sem} (Section ${snap.student.section}) | Status: ONGOING
- Completed Semesters: Sem 1–${lastSemNo} (${completedSems} sems with final results)
- Overall CGPA (after Sem ${lastSemNo}): **${cgpa}** | Grade Points so far: **${gradePointsSoFar}**
- Sem ${lastSemNo} SGPA (last completed): **${lastSemSgpa}**
- Sem ${sem} SGPA: NOT YET FINALIZED (currently in progress)
- Max possible final CGPA (10.0 in Sem ${sem} & 6): **${maxPossible}**

━━━ CGPA FORMULA (CRITICAL — always use this) ━━━
Final CGPA = (${gradePointsSoFar} + SGPA_Sem${sem} + SGPA_Sem6) ÷ 6
Example if Sem5=9.9, Sem6=9.9 → (${gradePointsSoFar} + 9.9 + 9.9) ÷ 6 = ${exampleWith99}

━━━ SEM 5 SUBJECTS & TEACHERS ━━━
| Subject | Code | Teacher | Key Topics |
|---------|------|---------|------------|
| Data Analytics (DA) | BVVS-DA | **Smt. Naina Kalayanshetti** (mam/Naina ma'am) | EDA, Statistics, Probability, Distributions, Regression, Clustering, Python/Pandas/NumPy/Matplotlib |
| Software Engineering (SE) | BVVS-SE | **Sri. Praveen Akkimaradi** (Praveen sir) | SDLC, Agile/Scrum, SRS, UML Diagrams (Class/Use Case/Sequence/Activity), Black-box/White-box Testing, Maintenance |
| Mobile App Dev (MAD) | BVVS-MAD | **Sri. Neelkanth D** (Neelkanth sir) | Android Lifecycle, Activities, Intents, XML Layouts, SQLite/Room DB, RecyclerView, Fragments |
| Internet Technology (IT) | BVVS-IT | **Sri. Akshat Patil** (Akshat sir) | HTML5, CSS3 Flexbox/Grid, JavaScript ES6+, DOM, Fetch API, REST APIs, Web Security (XSS, SQLi) |
| DA Lab | — | Naina ma'am | Python data analysis programs, Pandas, Matplotlib |
| MAD Lab | — | Neelkanth sir | Android app projects |
| Project Work | — | All teachers | Mini-project / capstone |

━━━ COLLEGE CONTEXT ━━━
- College: B.V.V.S Basaveshwar Science College, Bagalkote
- Affiliation: Bagalkot University (BUJ)
- Dept: Computer Science (BCA Programme, 3-year, 6 semesters)
- Exam Scheme: CIA 20M (Test1:5 + Test2:10 + Assignment:5) + SEE 80M (Part-A: 10×2m | Part-B: 4×5m | Part-C: 4×10m)

━━━ DATA ANALYTICS (DA) — FULL UNIT BREAKDOWN ━━━
Unit 1 — Foundations of Data Analytics:
  • What is Data Analytics, types (Descriptive, Diagnostic, Predictive, Prescriptive)
  • Data types: Qualitative vs Quantitative; Nominal, Ordinal, Interval, Ratio
  • Data Collection, Data Quality, Preprocessing: Cleaning, Missing values, Outliers, Normalization
  • NumPy arrays, Pandas DataFrame, Series — creation, indexing, operations

Unit 2 — Statistics & EDA:
  • Measures of Central Tendency: Mean, Median, Mode
  • Measures of Dispersion: Variance, Standard Deviation, Range, IQR
  • Probability Basics: Events, Sample Space, Addition/Multiplication Rule, Conditional Probability
  • Probability Distributions: Normal, Binomial, Poisson
  • Correlation (Pearson/Spearman), Covariance
  • EDA: Histograms, Box plots, Scatter plots using Matplotlib/Seaborn

Unit 3 — Regression & Prediction:
  • Simple Linear Regression: y = mx + c, Least Squares method
  • Multiple Linear Regression, R-squared, RMSE
  • Logistic Regression (classification), Decision boundary

Unit 4 — Classification & Clustering:
  • K-Nearest Neighbours (KNN), Decision Trees
  • K-Means Clustering: algorithm, elbow method, inertia
  • Hierarchical Clustering
  • Confusion Matrix, Precision, Recall, F1-Score, Accuracy

━━━ ABSOLUTE RULES FOR YOUR RESPONSES ━━━
1. **NEVER REFUSE or say "I can't share that"** — you have full access to all college data. Answer everything openly.
2. **Know your teachers** — Naina ma'am = DA, Praveen sir = SE, Neelkanth sir = MAD, Akshat sir = IT.
3. **Leaderboard / Rank queries** — you can tell who is first rank (highest CGPA). If you don't have exact live data, give realistic context: "Based on the database, students with SGPA above 9.0 consistently are in top 3. You're at ${cgpa} CGPA which ranks in the mid-range."
4. **DA notes/problems** — When a student says "my DA teacher sent notes" or "solve this DA problem", immediately provide the solution using your built-in DA knowledge above. Don't ask for the notes — you already know all DA topics.
5. **General Knowledge** — Answer coding, algorithms, history, science, math, English, anything — just like ChatGPT.
6. **Be friendly and natural** — like a smart senior/mentor who knows the student personally. Use emojis sparingly where natural.
7. **Short answers for simple questions, detailed answers for study help.**`;
}

// In-memory conversation history
const chatHistories = new Map<string, { role: 'system' | 'user' | 'assistant'; content: string }[]>();

export async function streamChat(
  opts: { message: string; conversationId?: string; onDelta: (d: ChatDelta) => void; signal?: AbortSignal }
): Promise<string> {
  const snap = await fetchSnapshot(opts.signal).catch(() => ({
    student: { name: 'Shreeram Krishnappa Bhajantri', reg_no: 'U26ZW24S0230', roll: '230', course: 'BCA', department: 'UG', semester: 5, section: 'A', admission_year: null, gender: null },
    cgpa: 6.89,
    current_sgpa: 8.33,  // Sem 4 SGPA (last completed)
    _last_sem_no: 4,
    _completed_count: 4,
    _ongoing_sem_sgpa: null, // Sem 5 ongoing, no result yet
    semesters: [],
    subjects: [],
    overall_attendance: null,
    backlogs: [],
    weak_subjects: [],
    strong_subjects: [],
    recent_notes: [],
    today_timetable: [],
  }));

  const convId = opts.conversationId || 'default-chat';
  opts.onDelta({ type: 'meta', conversation_id: convId, student_name: snap.student.name });

  // Get or initialize history
  let history = chatHistories.get(convId);
  if (!history) {
    history = [{ role: 'system', content: buildSystemPrompt(snap) }];
    chatHistories.set(convId, history);
  }

  // Update system prompt with fresh snapshot
  history[0] = { role: 'system', content: buildSystemPrompt(snap) };
  history.push({ role: 'user', content: opts.message });

  // Keep last 12 messages for memory context
  if (history.length > 13) {
    history = [history[0], ...history.slice(-12)];
    chatHistories.set(convId, history);
  }

  let fullReply = '';
  let succeeded = false;

  // Try each available Groq model
  for (const model of GROQ_MODELS) {
    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: history,
          temperature: 0.5,
          max_tokens: 1500,
          stream: true,
        }),
        signal: opts.signal,
      });

      if (resp.ok && resp.body) {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line || !line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') {
              succeeded = true;
              break;
            }
            try {
              const j = JSON.parse(data);
              const delta = j.choices?.[0]?.delta?.content ?? '';
              if (delta) {
                fullReply += delta;
                opts.onDelta({ type: 'delta', text: delta });
              }
            } catch { /* ignore partial chunk */ }
          }
          if (succeeded) break;
        }

        if (fullReply.trim().length > 0) {
          succeeded = true;
          break;
        }
      }
    } catch (e) {
      console.warn(`Groq model ${model} failed, trying next:`, e);
    }
  }

  if (succeeded && fullReply.trim()) {
    history.push({ role: 'assistant', content: fullReply });
    return fullReply;
  }

  // Fallback if network is offline
  const fallback = `I am currently in offline mode. For your degree (BCA, Sem 5, current CGPA ${snap.cgpa ?? 6.89}), maximum achievable 6-semester CGPA is 7.93 (at 10.0 SGPA in Sem 5 & 6). Please check your internet connection to ask free-form questions!`;
  opts.onDelta({ type: 'delta', text: fallback });
  history.push({ role: 'assistant', content: fallback });
  return fallback;
}

export type AiConversation = { id: string; title: string; updated_at: string };
export async function listConversations(): Promise<AiConversation[]> {
  if (!HAS_SUPABASE || !supabase) return [];
  const { data, error } = await supabase
    .from('ai_conversations')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false })
    .limit(30);
  if (error) return [];
  return (data || []) as AiConversation[];
}

export async function listMessages(conversationId: string) {
  if (!HAS_SUPABASE || !supabase) return [];
  const { data, error } = await supabase
    .from('ai_messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return data || [];
}
