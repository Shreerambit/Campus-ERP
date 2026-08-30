// erp-ai: personal academic intelligence layer for students.
// Handles snapshot, cgpa planning, and streaming chat with Groq + RAG notes.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { buildSnapshot, cgpaTargetPlan } from '../_shared/academicSnapshot.ts';
import { streamChat, ChatMsg } from '../_shared/llm.ts';
import { retrieveRelevantChunks, wantsNotes } from '../_shared/rag.ts';

const sbUrl = Deno.env.get('SUPABASE_URL')!;
const sbAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const groqApiKey = Deno.env.get('GROQ_API_KEY') || '';
const aiModel = Deno.env.get('AI_MODEL') || 'llama-3.1-70b-versatile';

const corsHeaders = (origin?: string | null) => ({
  'Access-Control-Allow-Origin': origin ?? '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Prefer, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

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

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  // Create scoped client with caller's JWT for RLS
  const sb = createClient(sbUrl, sbAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user }, error: userErr } = await sb.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  // Resolve student record
  const { data: student, error: studentErr } = await sb
    .from('students')
    .select('id, college_id, name, reg_no, semester, section')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (studentErr || !student) {
    return new Response(JSON.stringify({ error: 'Student profile not found or not a student' }), {
      status: 403,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action || 'snapshot';

  // 1. Snapshot action
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

  // 2. CGPA plan action
  if (action === 'plan') {
    try {
      const snapshot = await buildSnapshot(sb, student.id, student.college_id);
      const targetCgpa = Number(body.target_cgpa) || 8.5;
      const completedSems = snapshot.semesters.filter(s => s.sgpa != null).length;
      const totalSems = 6; // Typical 3-year BSc/BCA or 8 for BE
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

  // 3. Streaming Chat action
  if (action === 'chat') {
    const userMessage = (body.message || '').trim();
    if (!userMessage) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    if (!groqApiKey) {
      // SSE error stream if GROQ API key not set in edge function secrets
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Groq API Key is not configured in Edge Function secrets.' })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
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

    // Resolve or create conversation
    let convId = body.conversation_id;
    if (!convId) {
      const { data: newConv } = await sb
        .from('ai_conversations')
        .insert({
          student_id: student.id,
          college_id: student.college_id,
          title: userMessage.slice(0, 50),
        })
        .select('id')
        .single();
      convId = newConv?.id;
    } else {
      await sb
        .from('ai_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', convId);
    }

    // Store user message
    if (convId) {
      await sb.from('ai_messages').insert({
        conversation_id: convId,
        student_id: student.id,
        college_id: student.college_id,
        role: 'user',
        content: userMessage,
      });
    }

    // Build context
    const snapshot = await buildSnapshot(sb, student.id, student.college_id);
    let noteContext = '';
    if (wantsNotes(userMessage)) {
      const chunks = await retrieveRelevantChunks(sb, {
        collegeId: student.college_id,
        query: userMessage,
        subjectIds: snapshot.subjects.map(s => s.id),
        limit: 4,
      });
      if (chunks.length > 0) {
        noteContext = '\n\nRELEVANT STUDY NOTES / SLIDES (CITE THESE WHEN ANSWERING):\n' +
          chunks.map((c, i) => `[${i+1}] Title: ${c.note_title || 'Note'} (${c.subject_code || ''})\n${c.content}`).join('\n\n');
      }
    }

    const systemPrompt = `You are ERP AI, the intelligent academic mentor and assistant for ${snapshot.student.name} at their college.

OFFICIAL ACADEMIC RECORD (GROUND TRUTH - NEVER CONTRADICT OR INVENT NUMBERS):
- Student: ${snapshot.student.name} (Reg No: ${snapshot.student.reg_no})
- Course: ${snapshot.student.course}, Sem ${snapshot.student.semester}, Sec ${snapshot.student.section}
- Current CGPA: ${snapshot.cgpa != null ? snapshot.cgpa : 'N/A'}
- Latest SGPA: ${snapshot.current_sgpa != null ? snapshot.current_sgpa : 'N/A'}
- Overall Attendance: ${snapshot.overall_attendance ? `${snapshot.overall_attendance.pct}% (${snapshot.overall_attendance.present}/${snapshot.overall_attendance.total} classes)` : 'N/A'}
- Weak Subjects: ${snapshot.weak_subjects.map(s => `${s.code} (${s.pct}%) - ${s.reason}`).join(', ') || 'None'}
- Strong Subjects: ${snapshot.strong_subjects.map(s => `${s.code} (${s.pct}%)`).join(', ') || 'None'}
- Backlogs: ${snapshot.backlogs.map(s => `${s.code} (${s.name})`).join(', ') || 'None'}${noteContext}

GUIDELINES:
1. Always be supportive, encouraging, concise, and academically precise.
2. Use markdown formatting (bullet points, bold text) for readability.
3. If asked about CGPA, attendance, or weak subjects, refer strictly to the ground truth data above.
4. If asked study questions or definitions, explain clearly with examples. If note excerpts are provided above, reference them.`;

    // Load recent history
    const { data: pastMsgs = [] } = convId ? await sb
      .from('ai_messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(10) : { data: [] };

    const messagesForLlm: ChatMsg[] = [
      { role: 'system', content: systemPrompt },
      ...((pastMsgs as any[]).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))),
      { role: 'user', content: userMessage },
    ];

    // Create readable stream for SSE
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let fullAssistantReply = '';

        // Send initial metadata
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'meta', conversation_id: convId, student_name: snapshot.student.name })}\n\n`)
        );

        try {
          await streamChat(
            {
              apiKey: groqApiKey,
              model: aiModel,
              messages: messagesForLlm,
              temperature: 0.4,
              maxTokens: 1024,
            },
            (delta) => {
              fullAssistantReply += delta;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'delta', text: delta })}\n\n`)
              );
            }
          );

          // Save assistant message to DB
          if (convId && fullAssistantReply) {
            await sb.from('ai_messages').insert({
              conversation_id: convId,
              student_id: student.id,
              college_id: student.college_id,
              role: 'assistant',
              content: fullAssistantReply,
            });
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (err: any) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', message: err?.message || 'Chat generation failed' })}\n\n`)
          );
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
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