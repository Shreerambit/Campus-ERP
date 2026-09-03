// Shared LLM helper — Groq (OpenAI-compatible) streaming chat.
// Model can be overridden via AI_MODEL env var; defaults to openai/gpt-oss-120b.

export type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

export interface StreamOpts {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  messages: ChatMsg[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

const DEFAULT_BASE = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';

export async function streamChat(opts: StreamOpts, onDelta: (delta: string) => void): Promise<string> {
  const base = opts.baseUrl || DEFAULT_BASE;
  const model = opts.model || DEFAULT_MODEL;
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 1024,
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
  let buf = '';
  let full = '';
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
