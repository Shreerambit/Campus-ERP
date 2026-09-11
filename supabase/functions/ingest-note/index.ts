// ingest-note: called manually or by a DB trigger/HTTP to chunk + embed a
// study_material row (either its `body` text or a PDF at `path_or_url`).
//
// Requires service role. POST { note_id }. Idempotent: deletes prior chunks
// for that note_id first.

import { serve } from 'jsr:@std/http/server';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { chunkText } from '../_shared/rag.ts';

const sbUrl = Deno.env.get('SUPABASE_URL')!;
const sbServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = (origin?: string | null) => ({
  'Access-Control-Allow-Origin': origin ?? '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const projectRef = Deno.env.get('SB_PROJECT_REF') ?? '';
  if (!projectRef || !sbServiceKey) return null;
  try {
    const r = await fetch(`https://${projectRef}.supabase.co/functions/v1/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sbServiceKey}` },
      body: JSON.stringify({ inputs: texts }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const embs: number[][] = j.embeddings ?? (Array.isArray(j[0]) ? j : null);
    return embs && embs.length === texts.length ? embs : null;
  } catch { return null; }
}

async function extractPdfText(pdfUrl: string): Promise<string> {
  // Download PDF and try a naive text extraction using pdf-parse if available.
  // For edge runtimes we do a simple binary fetch + a rough text strip.
  // In production, trigger this via a pg_net/webhook to a proper PDF parser
  // or use Supabase's built-in document AI when available.
  try {
    const r = await fetch(pdfUrl);
    if (!r.ok) return '';
    const buf = await r.arrayBuffer();
    const bytes = new Uint8Array(buf);
    // Very naive PDF text extraction: look for stream objects with text ops.
    // This handles many text-based PDFs produced by Word/Google Docs.
    const td = new TextDecoder('utf-8', { fatal: false });
    let txt = td.decode(bytes);
    txt = txt.replace(/\\n/g, '\n').replace(/\(([^\)]{2,300})\)\s*Tj/g, '$1\n');
    txt = txt.replace(/\[(.*?)\]\s*TJ/g, (_m, g) => g.replace(/\(-?\d+\)/g, '').replace(/^\(/, '').replace(/\)$/, ''));
    txt = txt.replace(/[^\x20-\x7E\n\t]/g, ' ');
    txt = txt.replace(/\s+/g, ' ').trim();
    return txt.length > 200 ? txt : '';
  } catch { return ''; }
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return new Response('{}', { status: 405, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });

  const auth = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const sbAdmin = createClient(sbUrl, sbServiceKey, { auth: { persistSession: false } });
  // Allow service key OR an authenticated admin/teacher
  if (auth !== sbServiceKey) {
    const sbUser = createClient(sbUrl, auth ?? '', { auth: { persistSession: false } });
    const { data: { user } } = await sbUser.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    const { data: p } = await sbUser.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!p || (p.role !== 'admin' && p.role !== 'super')) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const { note_id } = await req.json().catch(() => ({}));
  if (!note_id) return new Response(JSON.stringify({ error: 'note_id required' }), { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });

  const { data: note } = await sbAdmin.from('study_materials')
    .select('id, college_id, subject_id, title, body, path_or_url')
    .eq('id', note_id).maybeSingle();
  if (!note) return new Response(JSON.stringify({ error: 'Note not found' }), { status: 404, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });

  // Build full text
  let text = (note.body || '').trim();
  if (note.path_or_url && /\.pdf(\?|$)/i.test(note.path_or_url)) {
    const pdfText = await extractPdfText(note.path_or_url);
    if (pdfText) text = `${text ? text + '\n\n' : ''}${pdfText}`;
  }
  if (!text || text.length < 30) {
    return new Response(JSON.stringify({ ok: true, chunks: 0, reason: 'no text' }), { headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });
  }

  // Chunk
  const chunks = chunkText(text, 800, 100);

  // Reset chunks for this note
  await sbAdmin.from('note_chunks').delete().eq('note_id', note.id);

  // Embed in batches of 10
  const BATCH = 10;
  let inserted = 0;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const embs = await embedTexts(batch);
    const rows = batch.map((c, k) => ({
      college_id: note.college_id,
      note_id: note.id,
      subject_id: note.subject_id,
      chunk_index: i + k,
      content: c,
      token_count: Math.round(c.length / 4),
      embedding: embs?.[k] ?? null,
    }));
    const { error } = await sbAdmin.from('note_chunks').insert(rows);
    if (error) console.warn('insert chunks error', error.message);
    else inserted += rows.length;
  }
  return new Response(JSON.stringify({ ok: true, chunks: inserted }), {
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
});
