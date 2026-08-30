/**
 * ERP AI — personalized academic intelligence dashboard + chat.
 *
 * Identity is automatic (uses Supabase auth); no "who are you" prompt.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Sparkles, Send, Loader2, AlertCircle, Target, TrendingUp, TrendingDown,
  BookOpen, CheckCircle2, Clock, RefreshCcw, Plus, X, User, Bot, BarChart3,
  AlertTriangle, GraduationCap, CalendarDays, ArrowRight,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchCgpaPlan, fetchSnapshot, listConversations, listMessages, streamChat, type AiSnapshot } from '../lib/erpAi';
import { useAuth } from '../lib/auth';
import MarkdownRenderer from '../components/MarkdownRenderer';

type Msg = { role: 'user' | 'assistant'; content: string };

export default function ErpAI() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'dashboard' | 'chat'>('dashboard');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamErr, setStreamErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pull the authoritative academic snapshot
  const { data: snap, isLoading, error } = useQuery<AiSnapshot>({
    queryKey: ['erp-ai', 'snapshot', user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: () => fetchSnapshot(),
  });

  // Load prior messages when a conversation is selected
  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    listMessages(conversationId).then(rows => {
      setMessages((rows as any[]).map(r => ({ role: r.role, content: r.content })));
    });
  }, [conversationId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || streaming) return;
    setStreamErr(null);
    setInput('');
    setTab('chat');
    const userMsg: Msg = { role: 'user', content: q };
    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '' }]);
    setStreaming(true);
    try {
      await streamChat({
        message: q,
        conversationId: conversationId ?? undefined,
        onDelta: (d) => {
          if (d.type === 'meta') {
            setConversationId(d.conversation_id);
          } else if (d.type === 'delta') {
            setMessages(prev => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === 'assistant') {
                copy[copy.length - 1] = { ...last, content: last.content + d.text };
              }
              return copy;
            });
          } else if (d.type === 'error') {
            setStreamErr(d.message);
          }
        },
      });
    } catch (e: any) {
      setStreamErr(e?.message || String(e));
    } finally {
      setStreaming(false);
    }
  };

  const newChat = () => {
    setConversationId(null);
    setMessages([]);
    setStreamErr(null);
    setTab('chat');
  };

  const cgpa = snap?.cgpa ?? 6.89;
  const sgpa = snap?.current_sgpa ?? 8.33;
  const backlogs = snap?.backlogs ?? [];
  const weak = snap?.weak_subjects ?? [];
  const strong = snap?.strong_subjects ?? [];
  const att = snap?.overall_attendance;

  return (
    <div className="space-y-4 min-w-0">
      {/* Header */}
      <section
        className="card !p-0 relative overflow-hidden"
        style={{ backgroundImage: 'linear-gradient(120deg,#307DFF 0%,#3C3DFF 55%,#7F23FF 100%)' }}
      >
        <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-white/15 blur-3xl" />
        <div className="relative p-5 sm:p-6 text-white flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-white/15 backdrop-blur grid place-items-center">
            <Sparkles size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-widest opacity-80 font-semibold">ERP AI</div>
            <div className="text-lg sm:text-xl font-bold leading-tight clip-1">
              Hi {snap?.student?.name?.split(' ')[0] ?? 'there'} 👋, let's ace this semester
            </div>
            <div className="text-[12px] opacity-90 mt-0.5">
              {snap ? `${snap.student.course} · Sem ${snap.student.semester} · Sec ${snap.student.section} · Roll ${snap.student.roll}` : 'Loading your academic profile…'}
            </div>
          </div>
          <button onClick={newChat} className="hidden sm:grid place-items-center h-10 w-10 rounded-2xl bg-white/15 hover:bg-white/25 transition shrink-0" title="New chat">
            <Plus size={18} />
          </button>
        </div>
        {/* Tabs */}
        <div className="relative px-3 pb-3 flex gap-2">
          <TabButton active={tab === 'dashboard'} onClick={() => setTab('dashboard')} icon={<BarChart3 size={14} />}>Dashboard</TabButton>
          <TabButton active={tab === 'chat'} onClick={() => setTab('chat')} icon={<Sparkles size={14} />}>Ask AI</TabButton>
          <button onClick={newChat} className="ml-auto chip !bg-white/15 !text-white !border-white/30">
            <Plus size={12} /> New chat
          </button>
        </div>
      </section>

      <AnimatePresence mode="wait">
        {tab === 'dashboard' ? (
          <motion.div key="dash" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="space-y-4">
            {isLoading && <div className="card flex items-center gap-2"><Loader2 className="animate-spin" /> Loading your data…</div>}
            {error && <div className="card border-ios-red/30 bg-ios-red/10 text-ios-red text-sm flex items-start gap-2"><AlertCircle size={16} className="mt-0.5" /> {(error as Error)?.message}</div>}

            {snap && (
              <>
                {/* Stat strip */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="CGPA" value={cgpa != null ? cgpa.toFixed(2) : '—'} tone="from-ios-blue to-ios-indigo" icon={<GraduationCap size={16} />} />
                  <StatCard label="Current SGPA" value={sgpa != null ? sgpa.toFixed(2) : '—'} tone="from-ios-purple to-ios-pink" icon={<Target size={16} />} />
                  <StatCard label="Attendance" value={att ? `${att.pct}%` : '—'} tone={att && att.pct < 75 ? 'from-ios-red to-ios-pink' : 'from-ios-teal to-ios-blue'} icon={<Clock size={16} />} sub={att ? `${att.present}/${att.total} classes` : 'Recorded in ERP'} />
                  <StatCard label="Backlogs" value={String(backlogs.length)} tone={backlogs.length ? 'from-ios-red to-ios-orange' : 'from-ios-green to-ios-teal'} icon={backlogs.length ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} sub={backlogs.length ? 'needs clearing' : 'all clear'} />
                </div>

                {/* CGPA goal planner */}
                <CgpaPlanner
                  cgpa={cgpa}
                  student={snap.student}
                  onAskPlan={(target) => send(`How can I reach ${target} CGPA and what is the best strategy to maximize my score?`)}
                />

                {/* Weak / strong */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="card">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-8 w-8 rounded-xl bg-ios-orange/15 text-ios-orange grid place-items-center"><TrendingDown size={15}/></div>
                      <div className="h-section">Needs attention</div>
                    </div>
                    {weak.length === 0 && backlogs.length === 0 ? (
                      <p className="text-sm opacity-70">🎉 You don't have any weak subjects right now. Keep it up!</p>
                    ) : (
                      <ul className="space-y-2">
                        {backlogs.slice(0, 4).map(b => (
                          <li key={b.code} className="flex items-center gap-3 p-2.5 rounded-xl bg-ios-red/10 border border-ios-red/20">
                            <span className="chip !bg-ios-red !text-white !border-transparent">{b.code}</span>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm clip-1">{b.name}</div>
                              <div className="text-[11px] opacity-70">Backlog — {b.pct != null ? `${b.pct}%` : 'marks pending'}</div>
                            </div>
                            <button onClick={() => send(`Give me a practical plan to clear my ${b.code} (${b.name}) backlog.`)} className="chip text-ios-red">Help</button>
                          </li>
                        ))}
                        {weak.slice(0, 4).map(w => (
                          <li key={w.code} className="flex items-center gap-3 p-2.5 rounded-xl bg-ios-orange/10 border border-ios-orange/20">
                            <span className="chip !bg-ios-orange !text-white !border-transparent">{w.code}</span>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm clip-1">{w.name}</div>
                              <div className="text-[11px] opacity-70">{w.reason}</div>
                            </div>
                            <button onClick={() => send(`Help me improve ${w.code} (${w.name}) — I'm scoring ${w.pct}%.`)} className="chip text-ios-orange">Help</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="card">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-8 w-8 rounded-xl bg-ios-green/15 text-ios-green grid place-items-center"><TrendingUp size={15}/></div>
                      <div className="h-section">Strong areas</div>
                    </div>
                    {strong.length === 0 ? (
                      <p className="text-sm opacity-70">Not enough graded subjects yet to identify strengths. Keep going!</p>
                    ) : (
                      <ul className="space-y-2">
                        {strong.slice(0, 6).map(s => (
                          <li key={s.code} className="flex items-center gap-3 p-2.5 rounded-xl bg-ios-green/10 border border-ios-green/20">
                            <span className="chip !bg-ios-green !text-white !border-transparent">{s.code}</span>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm clip-1">{s.name}</div>
                              <div className="text-[11px] opacity-70">Scoring {s.pct}%</div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {/* Quick actions */}
                <div className="card">
                  <div className="h-section mb-3">Quick questions</div>
                  <div className="flex flex-wrap gap-2">
                    <QuickAction onClick={() => send('Analyze my academic performance overall.')}>📊 Analyze my performance</QuickAction>
                    <QuickAction onClick={() => send('Which subjects should I focus on this week?')}>🎯 What to focus on</QuickAction>
                    <QuickAction onClick={() => send('Give me a 7-day study plan based on my weak subjects.')}>📅 7-day study plan</QuickAction>
                    <QuickAction onClick={() => send('How can I reach 8.0 CGPA and what is the best strategy to maximize my score?')}>🧮 Strategy for 8.0 CGPA</QuickAction>
                    <QuickAction onClick={() => send('How is my attendance? Any classes I should not miss?')}>🕒 Attendance review</QuickAction>
                    {snap.recent_notes?.length > 0 && (
                      <QuickAction onClick={() => send(`Summarize my recent notes on ${snap.recent_notes[0].subject_code ?? 'the latest topic'} in simple language.`)}>📝 Summarize latest notes</QuickAction>
                    )}
                    <QuickAction onClick={() => send('Create 10 MCQs for exam practice from my notes.')}>🧠 MCQ practice</QuickAction>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        ) : (
          <motion.div key="chat" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="space-y-3">
            <ConversationsSidebar current={conversationId} onPick={setConversationId} onNew={newChat} />

            <div className="card !p-0 overflow-hidden flex flex-col h-[70vh] min-h-[480px]">
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
                {messages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6">
                    <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-ios-blue to-ios-purple text-white grid place-items-center mb-3"><Sparkles size={26}/></div>
                    <div className="h-title">Ask ERP AI anything about your academics</div>
                    <p className="text-sm opacity-70 max-w-sm mt-1">
                      I have analyzed your marks, current {cgpa?.toFixed(2)} CGPA, {sgpa?.toFixed(2)} SGPA, and syllabus. Ask anything below:
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 justify-center max-w-lg">
                      <QuickAction onClick={() => send('How can I reach 8.0 CGPA and what is the best strategy to maximize my score?')}>🎯 How can I reach 8 CGPA?</QuickAction>
                      <QuickAction onClick={() => send('Analyze my academic performance overall.')}>📊 How am I performing?</QuickAction>
                      <QuickAction onClick={() => send('Give me a 7-day study plan based on my weak subjects.')}>📅 7-day study routine</QuickAction>
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  m.content || i === messages.length - 1 ? (
                    <MessageBubble key={i} msg={m} name={snap?.student?.name?.split(' ')[0] ?? 'You'} />
                  ) : null
                ))}
                {streamErr && (
                  <div className="rounded-2xl border border-ios-red/30 bg-ios-red/10 text-ios-red text-sm p-3 flex items-start gap-2">
                    <AlertCircle size={16} className="mt-0.5 shrink-0"/>{streamErr}
                  </div>
                )}
              </div>

              {/* Composer */}
              <div className="p-3 border-t border-black/5 dark:border-white/10 bg-white/60 dark:bg-white/[0.03]">
                <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={streaming ? 'AI is analyzing your academics…' : 'Ask about your marks, CGPA goal, study plan, notes…'}
                    disabled={streaming}
                    className="flex-1 h-11 px-4 rounded-2xl bg-white/70 dark:bg-white/5 border border-white/60 dark:border-white/10 text-sm outline-none focus:ring-2 ring-ios-blue/40"
                  />
                  <button type="submit" disabled={streaming || !input.trim()} className="h-11 w-11 rounded-2xl btn-primary grid place-items-center disabled:opacity-50 shrink-0">
                    {streaming ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>}
                  </button>
                </form>
                <p className="text-[10px] opacity-60 mt-1 px-1">Calculations are backed by official university scale (10.0 scale).</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- Subcomponents ----------

function TabButton({ active, onClick, children, icon }: { active: boolean; onClick: () => void; children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-4 h-9 rounded-2xl text-sm font-semibold flex items-center gap-1.5 transition ${active ? 'bg-white text-ios-blue shadow-hi' : 'bg-white/15 text-white/80 hover:bg-white/25'}`}>
      {icon}{children}
    </button>
  );
}

function StatCard({ label, value, tone, icon, sub }: { label: string; value: string; tone: string; icon: React.ReactNode; sub?: string }) {
  return (
    <div className={`card !p-4 text-white relative overflow-hidden`} style={{ backgroundImage: `linear-gradient(135deg, var(--tw-gradient-stops))` }}>
      <div className={`absolute inset-0 bg-gradient-to-br ${tone} opacity-95`} />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider opacity-90 font-semibold">{label}</div>
          <div className="opacity-90">{icon}</div>
        </div>
        <div className="text-2xl sm:text-3xl font-black mt-1 leading-none">{value}</div>
        {sub && <div className="text-[11px] opacity-85 mt-1">{sub}</div>}
      </div>
    </div>
  );
}

function QuickAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="chip hover:bg-white/90 dark:hover:bg-white/15 text-[12px]">
      {children}
    </button>
  );
}

function MessageBubble({ msg, name }: { msg: Msg; name: string }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`h-8 w-8 rounded-full grid place-items-center shrink-0 ${isUser ? 'bg-ios-blue text-white' : 'bg-gradient-to-br from-ios-blue to-ios-purple text-white shadow-sm'}`}>
        {isUser ? <User size={14}/> : <Bot size={14}/>}
      </div>
      <div className={`max-w-[90%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${isUser ? 'bg-ios-blue text-white rounded-tr-md whitespace-pre-wrap' : 'bg-white/90 dark:bg-white/[0.06] rounded-tl-md border border-white/60 dark:border-white/10 shadow-sm text-gray-900 dark:text-gray-100'}`}>
        {msg.content ? (
          isUser ? (
            msg.content
          ) : (
            <MarkdownRenderer content={msg.content} />
          )
        ) : (
          <div className="flex items-center gap-1.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-pulse"/>
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-pulse" style={{ animationDelay: '150ms' }}/>
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-pulse" style={{ animationDelay: '300ms' }}/>
          </div>
        )}
      </div>
    </div>
  );
}

function CgpaPlanner({ cgpa, student, onAskPlan }: { cgpa: number | null; student: any; onAskPlan: (target: number) => void }) {
  const targets = [7.0, 7.5, 8.0, 8.5, 9.0];
  const totalSems = 6;
  const currentSem = student?.semester ?? 5;
  const completed = Math.max(1, currentSem - 1);
  const remaining = Math.max(1, totalSems - completed);
  const curCgpa = cgpa ?? 6.89;

  const maxPossible = +((curCgpa * completed + 10 * remaining) / totalSems).toFixed(2);

  const planFor = (t: number) => {
    const needed = (t * totalSems - curCgpa * completed) / remaining;
    return {
      needed: +needed.toFixed(2),
      feasible: needed <= 10 && needed >= 0,
    };
  };

  const [customVal, setCustomVal] = useState('8.0');

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-ios-blue to-ios-purple text-white grid place-items-center">
            <Target size={15}/>
          </div>
          <div>
            <div className="h-section">CGPA Goal Planner</div>
            <div className="text-[11px] opacity-60">
              {completed}/{totalSems} sems done · {remaining} to go
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-ios-blue/10 dark:bg-ios-blue/20 border border-ios-blue/30 px-3 py-1.5 text-xs text-ios-blue font-semibold flex items-center gap-1.5">
          <Sparkles size={13}/>
          Max Possible in 6 Sems: <strong>{maxPossible.toFixed(2)} CGPA</strong>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {targets.map(t => {
          const p = planFor(t);
          const feasible = p.feasible;
          return (
            <button
              key={t}
              onClick={() => onAskPlan(t)}
              className={`rounded-2xl p-3 text-left border transition relative group
                ${feasible
                  ? 'border-white/60 dark:border-white/10 bg-white/70 dark:bg-white/5 hover:border-ios-blue/50 hover:bg-white/90 dark:hover:bg-white/10'
                  : 'border-ios-orange/30 bg-ios-orange/5 hover:bg-ios-orange/10 dark:bg-ios-orange/10'}`}
            >
              <div className="flex items-center justify-between">
                <div className="text-lg font-black">{t.toFixed(1)}</div>
                <ArrowRight size={13} className="opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition"/>
              </div>
              <div className={`text-[11px] font-medium mt-0.5 ${feasible ? 'text-ios-blue' : 'text-ios-orange'}`}>
                {feasible ? `need ${p.needed} SGPA/sem` : `Max ${maxPossible} · Tap advice`}
              </div>
            </button>
          );
        })}
      </div>

      {/* Custom target input */}
      <div className="pt-1 flex items-center gap-2">
        <span className="text-xs font-semibold opacity-70">Custom Goal:</span>
        <input
          type="number"
          step="0.1"
          min="1"
          max="10"
          value={customVal}
          onChange={(e) => setCustomVal(e.target.value)}
          className="w-20 h-8 px-2.5 rounded-xl border border-white/60 dark:border-white/10 bg-white/70 dark:bg-white/5 text-xs font-bold outline-none focus:ring-1 ring-ios-blue"
        />
        <button
          type="button"
          onClick={() => {
            const num = parseFloat(customVal) || 8.0;
            onAskPlan(num);
          }}
          className="h-8 px-3 rounded-xl bg-ios-blue text-white text-xs font-bold hover:opacity-90 flex items-center gap-1"
        >
          <Sparkles size={12}/> Get Strategy
        </button>
        <span className="text-[11px] opacity-60 hidden sm:inline ml-auto">
          Tap any target card to have ERP AI analyze feasibility and provide suggestions.
        </span>
      </div>
    </div>
  );
}

function ConversationsSidebar({ current, onPick, onNew }: { current: string | null; onPick: (id: string) => void; onNew: () => void }) {
  const { data: convos = [] } = useQuery({
    queryKey: ['erp-ai', 'conversations'],
    queryFn: listConversations,
    staleTime: 30_000,
  });
  if (!convos.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
      <button onClick={onNew} className={`chip shrink-0 ${!current ? '!bg-ios-blue !text-white !border-transparent' : ''}`}>
        <Plus size={12}/> New chat
      </button>
      {convos.map((c: any) => (
        <button key={c.id} onClick={() => onPick(c.id)} className={`chip shrink-0 max-w-[200px] ${current === c.id ? '!bg-ios-blue !text-white !border-transparent' : ''}`}>
          <span className="clip-1">{c.title || 'Chat'}</span>
        </button>
      ))}
    </div>
  );
}
