// RAG: embed a query with Supabase's hosted embed endpoint (gte-small, 384-d),
// then call the match_note_chunks RPC scoped to the student's college + subjects.
//
// This is intentionally tolerant: if embedding is unavailable (function not
// deployed or project missing the vector extension), retrieval returns []
// and the AI answers from academic data only.

import { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export interface RetrievedChunk {
  id: string; note_id: string; subject_id: string | null;
  content: string; chunk_index: number; similarity: number;
  note_title?: string | null; subject_code?: string | null; subject_name?: string | null;
}

export async function retrieveRelevantChunks(
  sb: SupabaseClient,
  opts: {
    collegeId: string;
    query: string;
    subjectIds?: string[];
    limit?: number;
    minSimilarity?: number;
  }
): Promise<RetrievedChunk[]> {
  const { collegeId, query, subjectIds, limit = 5, minSimilarity = 0.35 } = opts;
  try {
    // 1. Embed the query via Supabase's hosted `embed` edge function (gte-small, 384-d).
    //    If it isn't deployed or the call fails, we return no chunks and the AI
    //    answers from academic data only.
    let embedding: number[] | null = null;
    const projectRef = (Deno.env.get('SB_PROJECT_REF') ?? '');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (projectRef && serviceKey) {
      const r = await fetch(`https://${projectRef}.supabase.co/functions/v1/embed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ inputs: [query] }),
      });
      if (r.ok) {
        const j = await r.json();
        const first = (j.embeddings && j.embeddings[0]) || j.embedding || null;
        if (Array.isArray(first) && first.length) embedding = first;
      } else {
        console.warn('[rag] embed function returned', r.status);
      }
    }

    if (!embedding || embedding.length < 10) return [];

    // Supabase gte-small embeddings are 384-d.
    const target = 384;
    const vec = embedding.slice(0, target);
    while (vec.length < target) vec.push(0);
    const pgVec = JSON.stringify(vec);

    // 2. Vector search
    const { data: rows, error } = await sb.rpc('match_note_chunks', {
      p_college_id: collegeId,
      p_query_embedding: pgVec,
      p_match_count: limit,
      p_subject_ids: subjectIds && subjectIds.length ? subjectIds : null,
    });
    if (error) throw error;

    // 3. Join note title + subject code for citation
    const chunks: RetrievedChunk[] = (rows as any[] || [])
      .filter(r => (r.similarity ?? 0) >= minSimilarity);
    if (chunks.length === 0) return [];
    const noteIds = Array.from(new Set(chunks.map(c => c.note_id)));
    const { data: notes } = await sb.from('study_materials')
      .select('id, title, subject:subject_id(code, name)')
      .in('id', noteIds);
    const noteMap = new Map<string, any>();
    for (const n of (notes as any[] || [])) noteMap.set(n.id, n);
    return chunks.map(c => {
      const n = noteMap.get(c.note_id);
      return {
        ...c,
        note_title: n?.title ?? null,
        subject_code: n?.subject?.code ?? null,
        subject_name: n?.subject?.name ?? null,
      };
    });
  } catch (err) {
    console.warn('[rag] retrieval failed, continuing without notes:', (err as Error)?.message);
    return [];
  }
}

/** Heuristic: decide whether the user's message likely wants notes/PDF context. */
export function wantsNotes(qIn: string): boolean {
  const q = qIn.toLowerCase();
  const hints = [
    'note', 'pdf', 'chapter', 'unit', 'topic', 'explain', 'summar', 'mcq',
    'question', 'answer', 'exam', 'revision', 'important', 'slide',
    'teacher uploaded', 'from my notes', 'in the note', 'according to',
    'define', 'what does the note say', 'give me notes', 'formula',
    'software engineering', 'data analytics', 'mobile application',
    'internet technology', 'da ', 'mad ', 'se ', 'it ',
  ];
  return hints.some(h => q.includes(h));
}

// Chunk text into ~800-char chunks with ~100-char overlap.
export function chunkText(text: string, size = 800, overlap = 100): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= size) return [clean];
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    out.push(clean.slice(i, i + size));
    i += size - overlap;
  }
  return out;
}
