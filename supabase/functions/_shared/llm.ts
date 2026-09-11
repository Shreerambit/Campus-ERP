// Shared LLM helper — supports OpenRouter, Gemini, OpenAI, and Groq.
// The caller picks the provider by passing baseUrl + apiKey; the helper
// handles the SSE streaming differences between providers.

export type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

export interface StreamOpts {
  apiKey: string;
  baseUrl?: string;      // defaults to Groq; pass openrouter/openai URL to override
  model?: string;
  messages: ChatMsg[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  provider?: 'openai_compat' | 'gemini'; // openai_compat = OpenRouter / OpenAI / Groq
}

// OpenAI-compatible streaming (OpenRouter, OpenAI, Groq all use identical SSE format)
async function streamOpenAICompat(opts: StreamOpts, onDelta: (d: string) => void): Promise<string> {
  const base = opts.baseUrl || 'https://api.groq.com/openai/v1';
  const model = opts.model || 'meta-llama/llama-3.3-70b-instruct';
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${opts.apiKey}`,
      ...(base.includes('openrouter') ? {
        'HTTP-Referer': 'https://campus-erp.vercel.app',
        'X-Title': 'Campus ERP AI',
      } : {}),
    },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 1500,
      stream: true,
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => '');
    throw new Error(`AI request failed (${res.status}): ${txt.slice(0, 500)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '', full = '';
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
      if (data === '[DONE]') return full;
      try {
        const j = JSON.parse(data);
        const d: string = j.choices?.[0]?.delta?.content ?? '';
        if (d) { full += d; onDelta(d); }
      } catch { /* ignore partial chunk */ }
    }
  }
  return full;
}

// Gemini streaming (different SSE format: candidates[].content.parts[].text)
async function streamGemini(opts: StreamOpts, onDelta: (d: string) => void): Promise<string> {
  const model = opts.model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${opts.apiKey}`;

  // Gemini requires alternating user/model turns; strip system & merge consecutive same-role
  const systemMsg = opts.messages.find(m => m.role === 'system');
  const nonSystem = opts.messages.filter(m => m.role !== 'system');
  const contents: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
  for (const m of nonSystem) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += '\n\n' + m.content;
    } else {
      contents.push({ role, parts: [{ text: m.content }] });
    }
  }
  // Ensure first turn is user
  if (contents.length > 0 && contents[0].role !== 'user') contents.shift();

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
      contents,
      generationConfig: {
        temperature: opts.temperature ?? 0.4,
        maxOutputTokens: opts.maxTokens ?? 1500,
      },
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Gemini request failed (${res.status}): ${txt.slice(0, 500)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '', full = '';
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
      try {
        const j = JSON.parse(data);
        const parts = j.candidates?.[0]?.content?.parts || [];
        for (const p of parts) {
          if (p.text) { full += p.text; onDelta(p.text); }
        }
      } catch { /* ignore partial chunk */ }
    }
  }
  return full;
}

export async function streamChat(opts: StreamOpts, onDelta: (delta: string) => void): Promise<string> {
  if (opts.provider === 'gemini') {
    return streamGemini(opts, onDelta);
  }
  return streamOpenAICompat(opts, onDelta);
}
