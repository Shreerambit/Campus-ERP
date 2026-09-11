// erp-ai: personal academic intelligence layer for students.
// Handles snapshot, cgpa planning, and streaming chat.
// Supports: OpenRouter, Gemini, OpenAI, Groq (whichever secret is set).
// API keys NEVER leave this function — they are read from Deno env secrets.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { buildSnapshot, cgpaTargetPlan } from '../_shared/academicSnapshot.ts';
import { streamChat, ChatMsg } from '../_shared/llm.ts';
import { retrieveRelevantChunks, wantsNotes } from '../_shared/rag.ts';

// ── Secrets (server-side only — never exposed to browser) ──────────────────
const sbUrl     = Deno.env.get('SUPABASE_URL')!;
const sbAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

// AI provider: pick whichever key is configured (priority: OpenRouter → Gemini → OpenAI → Groq)
const openrouterKey = Deno.env.get('OPENROUTER_API_KEY') || '';
const geminiKey     = Deno.env.get('GEMINI_API_KEY')     || '';
const openaiKey     = Deno.env.get('OPENAI_API_KEY')     || '';
const groqKey       = Deno.env.get('GROQ_API_KEY')       || '';

// Resolve which provider to use
type Provider = 'openrouter' | 'gemini' | 'openai' | 'groq' | 'none';
function resolveProvider(): { provider: Provider; apiKey: string; baseUrl?: string } {
  if (openrouterKey) return { provider: 'openrouter', apiKey: openrouterKey, baseUrl: 'https://openrouter.ai/api/v1' };
  if (geminiKey)     return { provider: 'gemini',     apiKey: geminiKey };
  if (openaiKey)     return { provider: 'openai',     apiKey: openaiKey, baseUrl: 'https://api.openai.com/v1' };
  if (groqKey)       return { provider: 'groq',       apiKey: groqKey,   baseUrl: 'https://api.groq.com/openai/v1' };
  return { provider: 'none', apiKey: '' };
}

function resolveModel(provider: Provider): string {
  const envModel = Deno.env.get('AI_MODEL') || '';
  if (envModel) return envModel;
  switch (provider) {
    case 'openrouter': return 'meta-llama/llama-3.3-70b-instruct';
    case 'gemini':     return 'gemini-2.0-flash';
    case 'openai':     return 'gpt-4o-mini';
    case 'groq':       return 'llama-3.3-70b-versatile';
    default:           return '';
  }
}

// ── CORS ────────────────────────────────────────────────────────────────────
const corsHeaders = (origin?: string | null) => ({
  'Access-Control-Allow-Origin': origin ?? '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Prefer, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

// ── Main handler ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  // ── Auth: require valid Supabase JWT ────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header. You must be logged in.' }), {
      status: 401,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  // Create a scoped client with the caller's JWT so RLS is applied
  const sb = createClient(sbUrl, sbAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: userErr } = await sb.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized — session invalid or expired. Please log in again.' }), {
      status: 401,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  // ── Resolve student record via auth_user_id (NEVER trust client-supplied ID) ──
  const { data: student, error: studentErr } = await sb
    .from('students')
    .select('id, college_id, name, reg_no, semester, section, course_id, department_id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (studentErr || !student) {
    return new Response(JSON.stringify({
      error: 'Student profile not found. Please contact your college admin.',
    }), {
      status: 403,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action || 'snapshot';

  // ── Action: snapshot ────────────────────────────────────────────────────
  if (action === 'snapshot') {
    try {
      const snapshot = await buildSnapshot(sb, student.id, student.college_id);
      return new Response(JSON.stringify({ ok: true, snapshot }), {
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err?.message || 'Failed to build snapshot' }), {
        status: 500,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }
  }

  // ── Action: cgpa plan ───────────────────────────────────────────────────
  if (action === 'plan') {
    try {
      const snapshot = await buildSnapshot(sb, student.id, student.college_id);
      const targetCgpa = Number(body.target_cgpa) || 8.5;
      const completedSems = snapshot.semesters.filter(s => s.sgpa != null).length;
      const totalSems = 6;
      const remainingSems = Math.max(1, totalSems - completedSems);
      const plan = cgpaTargetPlan(snapshot.cgpa, completedSems, remainingSems, targetCgpa);
      return new Response(JSON.stringify({ ok: true, snapshot, plan }), {
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err?.message || 'Failed to compute plan' }), {
        status: 500,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }
  }

  // ── Action: chat ────────────────────────────────────────────────────────
  if (action === 'chat') {
    const userMessage = (body.message || '').trim();
    if (!userMessage) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    const { provider, apiKey, baseUrl } = resolveProvider();
    const model = resolveModel(provider);

    if (provider === 'none') {
      const errStream = new ReadableStream({
        start(controller) {
          const enc = new TextEncoder();
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'error', message: 'No AI provider key is configured. Please set OPENROUTER_API_KEY (or GEMINI_API_KEY / GROQ_API_KEY / OPENAI_API_KEY) in Supabase Edge Function Secrets.' })}\n\n`));
          controller.enqueue(enc.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(errStream, {
        headers: { ...corsHeaders(origin), 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' },
      });
    }

    // Resolve or create conversation
    let convId = body.conversation_id;
    if (!convId) {
      const { data: newConv } = await sb
        .from('ai_conversations')
        .insert({ student_id: student.id, college_id: student.college_id, title: userMessage.slice(0, 60) })
        .select('id')
        .single();
      convId = newConv?.id;
    } else {
      await sb.from('ai_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', convId);
    }

    // Store user message (only columns that exist in schema after migration 026)
    if (convId) {
      await sb.from('ai_messages').insert({
        conversation_id: convId,
        student_id: student.id,
        college_id: student.college_id,
        role: 'user',
        content: userMessage,
      });
    }

    // Build context snapshot
    const snapshot = await buildSnapshot(sb, student.id, student.college_id);

    // RAG: attach relevant study notes if query is about notes/subject content
    let noteContext = '';
    try {
      if (wantsNotes(userMessage)) {
        const chunks = await retrieveRelevantChunks(sb, {
          collegeId: student.college_id,
          query: userMessage,
          subjectIds: snapshot.subjects.map(s => s.id),
          limit: 4,
        });
        if (chunks && chunks.length > 0) {
          noteContext = '\n\nRELEVANT STUDY NOTES (cite when answering):\n' +
            chunks.map((c: any, i: number) => `[${i+1}] ${c.note_title || 'Note'} (${c.subject_code || ''})\n${c.content}`).join('\n\n');
        }
      }
    } catch {
      // RAG is non-fatal
    }

    // Build grounded system prompt from actual DB data (no hardcoding)
    const semResultsList = snapshot.semesters
      .filter(r => r.sgpa != null)
      .map(r => `Sem ${r.semester}: SGPA ${Number(r.sgpa).toFixed(2)}`)
      .join(' | ');

    const subjectsList = snapshot.subjects
      .filter(s => s.percent != null)
      .map(s => `${s.name} (${s.code}) Sem${s.semester}: ${s.percent}% Grade ${s.grade}`)
      .join(', ');

    const systemPrompt = `You are ERP AI — an intelligent academic assistant for ${snapshot.student.name} at their college.

STUDENT PROFILE (GROUND TRUTH — always use these exact values):
- Name: ${snapshot.student.name} (Reg: ${snapshot.student.reg_no})
- Course: ${snapshot.student.course}, Semester: ${snapshot.student.semester}, Section: ${snapshot.student.section}
- Department: ${snapshot.student.department}
- CGPA: ${snapshot.cgpa != null ? snapshot.cgpa.toFixed(2) : 'N/A'}
- Latest SGPA: ${snapshot.current_sgpa != null ? Number(snapshot.current_sgpa).toFixed(2) : 'N/A'}
- Semester Results: ${semResultsList || 'No completed semester results yet'}
- Overall Attendance: ${snapshot.overall_attendance ? `${snapshot.overall_attendance.pct}% (${snapshot.overall_attendance.present}/${snapshot.overall_attendance.total} classes)` : 'N/A'}
- Subject Marks: ${subjectsList || 'No marks recorded yet'}
- Weak Subjects: ${snapshot.weak_subjects.map(s => `${s.code} (${s.pct}%) — ${s.reason}`).join(', ') || 'None'}
- Strong Subjects: ${snapshot.strong_subjects.map(s => `${s.code} (${s.pct}%)`).join(', ') || 'None'}
- Backlogs: ${snapshot.backlogs.map(s => `${s.code} (${s.name})`).join(', ') || 'None'}${noteContext}

RULES:
1. NEVER invent marks, CGPA, attendance, or teacher names not in the data above.
2. If data is unavailable, say clearly: "This information is not available in your records."
3. Be supportive, concise, and use markdown formatting.
4. You can answer general knowledge questions too (coding, science, math, etc.).`;

    // Load recent conversation history
    const { data: pastMsgs = [] } = convId ? await sb
      .from('ai_messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(12) : { data: [] };

    const messagesForLlm: ChatMsg[] = [
      { role: 'system', content: systemPrompt },
      ...((pastMsgs as any[]).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))),
    ];

    // SSE streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        let fullReply = '';

        controller.enqueue(enc.encode(`data: ${JSON.stringify({
          type: 'meta',
          conversation_id: convId,
          student_name: snapshot.student.name,
          engine: `${provider.toUpperCase()} (${model})`,
        })}\n\n`));

        try {
          await streamChat(
            {
              apiKey,
              baseUrl,
              model,
              messages: messagesForLlm,
              temperature: 0.4,
              maxTokens: 1500,
              provider: provider === 'gemini' ? 'gemini' : 'openai_compat',
            },
            (delta) => {
              fullReply += delta;
              controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'delta', text: delta })}\n\n`));
            }
          );

          // Save assistant reply (only columns that exist in schema after migration 026)
          if (convId && fullReply) {
            await sb.from('ai_messages').insert({
              conversation_id: convId,
              student_id: student.id,
              college_id: student.college_id,
              role: 'assistant',
              content: fullReply,
            });
          }

          controller.enqueue(enc.encode('data: [DONE]\n\n'));
        } catch (err: any) {
          const msg = err?.message || 'AI generation failed';
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`));
          controller.enqueue(enc.encode('data: [DONE]\n\n'));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders(origin),
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
    status: 400,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
});