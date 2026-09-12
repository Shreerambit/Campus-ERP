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
  AlertTriangle, GraduationCap, CalendarDays, ArrowRight, Settings, KeyRound,
  Check, ExternalLink, HelpCircle, ChevronDown, ChevronUp, Star, Award,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchCgpaPlan, fetchSnapshot, listConversations, listMessages, streamChat,
  getAiSettings, saveAiSettings, testAiConnection, AVAILABLE_MODELS,
  type AiSnapshot, type AiSettings, type AiProvider,
} from '../lib/erpAi';
import { useAuth } from '../lib/auth';
import MarkdownRenderer from '../components/MarkdownRenderer';

type Msg = { role: 'user' | 'assistant'; content: string; engine?: string };

export default function ErpAI() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'dashboard' | 'chat'>('dashboard');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamErr, setStreamErr] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [aiSettings, setAiSettingsState] = useState<AiSettings>(() => getAiSettings());
  const [showAllStrong, setShowAllStrong] = useState(false);
  const [showAllWeak, setShowAllWeak] = useState(false);
  const [showTranscripts, setShowTranscripts] = useState(false);
  const [selectedTranscriptSem, setSelectedTranscriptSem] = useState<number | 'all'>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pull the authoritative academic snapshot
  const { data: snap, isLoading, error } = useQuery<AiSnapshot>({
    queryKey: ['erp-ai', 'snapshot', user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: () => fetchSnapshot(),
  });

  // Load prior messages ONLY when manually switching conversations and NOT actively streaming
  useEffect(() => {
    if (!conversationId || streaming) return;
    let isCurrent = true;
    listMessages(conversationId).then(rows => {
      if (isCurrent && rows && rows.length > 0) {
        setMessages((rows as any[]).map(r => ({ role: r.role, content: r.content })));
      }
    });
    return () => { isCurrent = false; };
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

    const activeConvId = conversationId || `chat_${user?.id || 'student'}_${Date.now()}`;
    if (!conversationId) setConversationId(activeConvId);

    try {
      await streamChat({
        message: q,
        conversationId: activeConvId,
        onDelta: (d) => {
          if (d.type === 'delta') {
            setMessages(prev => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === 'assistant') {
                copy[copy.length - 1] = { ...last, content: last.content + d.text };
              }
              return copy;
            });
          } else if (d.type === 'meta') {
            setMessages(prev => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === 'assistant') {
                copy[copy.length - 1] = { ...last, engine: d.engine };
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
    setConversationId(`chat_${user?.id || 'student'}_${Date.now()}`);
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

  const currentProviderLabel = aiSettings.provider === 'local'
    ? 'Local Academic Engine'
    : aiSettings.provider === 'groq'
    ? `Groq (${aiSettings.model.replace('llama-', 'Llama-').replace('-versatile', '').replace('-instant', '')})`
    : aiSettings.provider === 'openai'
    ? `OpenAI (${aiSettings.model})`
    : `Gemini (${aiSettings.model.replace('gemini-', '')})`;

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
            <div className="text-[11px] uppercase tracking-widest opacity-80 font-semibold flex items-center gap-2">
              <span>ERP AI</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-normal">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {currentProviderLabel}
              </span>
            </div>
            <div className="text-lg sm:text-xl font-bold leading-tight clip-1">
              Hi {snap?.student?.name?.split(' ')[0] ?? 'there'} 👋, let's ace this semester
            </div>
            <div className="text-[12px] opacity-90 mt-0.5">
              {snap ? `${snap.student.course} · Sem ${snap.student.semester} · Sec ${snap.student.section} · Roll ${snap.student.roll}` : 'Loading your academic profile…'}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowSettings(true)}
              className="grid place-items-center h-10 w-10 rounded-2xl bg-white/15 hover:bg-white/25 transition text-white"
              title="AI Provider Settings"
            >
              <Settings size={18} />
            </button>
            <button
              onClick={newChat}
              className="hidden sm:grid place-items-center h-10 w-10 rounded-2xl bg-white/15 hover:bg-white/25 transition shrink-0"
              title="New chat"
            >
              <Plus size={18} />
            </button>
          </div>
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
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-xl bg-ios-orange/15 text-ios-orange grid place-items-center"><TrendingDown size={15} /></div>
                        <div className="h-section">Needs attention ({backlogs.length + weak.length})</div>
                      </div>
                      {(backlogs.length + weak.length) > 4 && (
                        <button
                          type="button"
                          onClick={() => setShowAllWeak(p => !p)}
                          className="chip text-[11px] text-ios-orange !border-ios-orange/30 hover:bg-ios-orange/10"
                        >
                          {showAllWeak ? 'Show Top 4' : `View All (${backlogs.length + weak.length})`}
                        </button>
                      )}
                    </div>
                    {weak.length === 0 && backlogs.length === 0 ? (
                      <p className="text-sm opacity-70">🎉 You don't have any weak subjects right now. Keep it up!</p>
                    ) : (
                      <ul className="space-y-2">
                        {backlogs.map(b => (
                          <li key={b.code} className="flex items-center gap-3 p-2.5 rounded-xl bg-ios-red/10 border border-ios-red/20">
                            <span className="chip !bg-ios-red !text-white !border-transparent font-mono text-[11px]">{b.code}</span>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm clip-1">{b.name}</div>
                              <div className="text-[11px] opacity-70">{b.semester ? `Sem ${b.semester} · ` : ''}Backlog — {b.pct != null ? `${b.pct}%` : 'marks pending'}</div>
                            </div>
                            <button onClick={() => send(`Give me a practical plan to clear my ${b.code} (${b.name}) backlog.`)} className="chip text-ios-red shrink-0">Help</button>
                          </li>
                        ))}
                        {(showAllWeak ? weak : weak.slice(0, Math.max(1, 4 - backlogs.length))).map(w => (
                          <li key={w.code} className="flex items-center gap-3 p-2.5 rounded-xl bg-ios-orange/10 border border-ios-orange/20">
                            <span className="chip !bg-ios-orange !text-white !border-transparent font-mono text-[11px]">{w.code}</span>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm clip-1">{w.name}</div>
                              <div className="text-[11px] opacity-70">{w.semester ? `Sem ${w.semester} · ` : ''}{w.reason}</div>
                            </div>
                            <button onClick={() => send(`Help me improve ${w.code} (${w.name}) — I'm scoring ${w.pct}%.`)} className="chip text-ios-orange shrink-0">Help</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="card">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-xl bg-ios-green/15 text-ios-green grid place-items-center"><TrendingUp size={15} /></div>
                        <div className="h-section">Strong areas ({strong.length})</div>
                      </div>
                      {strong.length > 4 && (
                        <button
                          type="button"
                          onClick={() => setShowAllStrong(p => !p)}
                          className="chip text-[11px] text-ios-green !border-ios-green/30 hover:bg-ios-green/10"
                        >
                          {showAllStrong ? 'Show Top 4' : `View All (${strong.length})`}
                        </button>
                      )}
                    </div>
                    {strong.length === 0 ? (
                      <p className="text-sm opacity-70">Not enough graded subjects yet to identify strengths. Keep going!</p>
                    ) : (
                      <ul className="space-y-2">
                        {(showAllStrong ? strong : strong.slice(0, 4)).map(s => {
                          const isWeb = s.code.includes('M11') || s.name.toLowerCase().includes('web');
                          return (
                            <li
                              key={s.code}
                              className={`flex items-center gap-3 p-2.5 rounded-xl border transition ${
                                isWeb
                                  ? 'bg-ios-green/15 border-ios-green/40 shadow-sm'
                                  : 'bg-ios-green/10 border-ios-green/20'
                              }`}
                            >
                              <span className="chip !bg-ios-green !text-white !border-transparent font-mono text-[11px]">{s.code}</span>
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-sm clip-1 flex items-center gap-1">
                                  {isWeb && <Star size={13} className="text-amber-500 fill-amber-500 shrink-0" />}
                                  <span>{s.name}</span>
                                </div>
                                <div className="text-[11px] opacity-75">
                                  {s.semester ? `Sem ${s.semester} · ` : ''}Scoring <strong>{s.pct}%</strong> {s.grade ? `(Grade ${s.grade})` : ''}
                                </div>
                              </div>
                              <button
                                onClick={() => send(`Explain why I scored ${s.pct}% in ${s.code} (${s.name}) and how to maintain this excellence.`)}
                                className="chip text-ios-green hover:bg-ios-green/20 text-xs shrink-0"
                              >
                                Review
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>

                {/* Full Academic Record & Transcripts Collapsible */}
                <div className="card space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-ios-blue to-ios-indigo text-white grid place-items-center">
                        <BookOpen size={16} />
                      </div>
                      <div>
                        <div className="h-section">Full Academic Record & Marks</div>
                        <div className="text-[11px] opacity-60">
                          {snap.subjects.filter(s => s.percent != null).length} graded subjects across Sem 1–{snap._last_sem_no ?? 4}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowTranscripts(prev => !prev)}
                      className="chip !bg-ios-blue/10 !text-ios-blue !border-ios-blue/30 text-xs font-semibold flex items-center gap-1 hover:!bg-ios-blue/20"
                    >
                      <span>{showTranscripts ? 'Hide Records' : 'View All Marks'}</span>
                      {showTranscripts ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>

                  {showTranscripts && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-3 pt-2"
                    >
                      {/* Semester Filter Tabs */}
                      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                        <button
                          type="button"
                          onClick={() => setSelectedTranscriptSem('all')}
                          className={`chip shrink-0 text-xs ${selectedTranscriptSem === 'all' ? '!bg-ios-blue !text-white !border-transparent' : ''}`}
                        >
                          All Semesters
                        </button>
                        {Array.from(new Set(snap.subjects.map(s => s.semester).filter(Boolean))).sort((a, b) => Number(a) - Number(b)).map(s => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setSelectedTranscriptSem(s as number)}
                            className={`chip shrink-0 text-xs ${selectedTranscriptSem === s ? '!bg-ios-blue !text-white !border-transparent' : ''}`}
                          >
                            Semester {s}
                          </button>
                        ))}
                      </div>

                      {/* Subject Table */}
                      <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
                        <table className="w-full text-xs min-w-[540px]">
                          <thead className="bg-black/5 dark:bg-white/5 text-[10px] uppercase font-semibold text-black/60 dark:text-white/60">
                            <tr className="border-b border-black/5 dark:border-white/10 text-left">
                              <th className="py-2.5 px-3">Sem</th>
                              <th className="py-2.5 px-3">Code</th>
                              <th className="py-2.5 px-3">Subject Name</th>
                              <th className="py-2.5 px-3 text-right">CIA</th>
                              <th className="py-2.5 px-3 text-right">SEE</th>
                              <th className="py-2.5 px-3 text-right">Total</th>
                              <th className="py-2.5 px-3 text-right">%</th>
                              <th className="py-2.5 px-3 text-center">Grade</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-black/5 dark:divide-white/5">
                            {snap.subjects
                              .filter(s => s.percent != null && (selectedTranscriptSem === 'all' || s.semester === selectedTranscriptSem))
                              .sort((a, b) => (b.semester || 0) - (a.semester || 0) || (b.percent || 0) - (a.percent || 0))
                              .map(s => {
                                const isWeb = s.code.includes('M11') || s.name.toLowerCase().includes('web');
                                return (
                                  <tr
                                    key={s.id}
                                    className={`hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition ${
                                      isWeb ? 'bg-ios-blue/5 dark:bg-ios-blue/10 font-medium' : ''
                                    }`}
                                  >
                                    <td className="py-2 px-3 font-semibold text-ios-blue">Sem {s.semester || '—'}</td>
                                    <td className="py-2 px-3 font-mono text-[11px] opacity-80">{s.code}</td>
                                    <td className="py-2 px-3">
                                      <div className="flex items-center gap-1.5">
                                        {isWeb && <Star size={12} className="text-amber-500 fill-amber-500 shrink-0" />}
                                        <span className="clip-1">{s.name}</span>
                                      </div>
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono tabular-nums">{s.internal ?? '—'}/{s.internal_max ?? '—'}</td>
                                    <td className="py-2 px-3 text-right font-mono tabular-nums">{s.external ?? '—'}/{s.external_max ?? '—'}</td>
                                    <td className="py-2 px-3 text-right font-bold font-mono tabular-nums">{s.total}/{s.total_max}</td>
                                    <td className="py-2 px-3 text-right font-bold tabular-nums">
                                      <span className={s.percent! >= 75 ? 'text-ios-green' : s.percent! >= 55 ? 'text-ios-blue' : 'text-ios-orange'}>
                                        {s.percent}%
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        s.grade === 'O' || s.grade === 'A+' ? 'bg-ios-green/15 text-ios-green' :
                                        s.grade === 'A' || s.grade === 'B+' ? 'bg-ios-blue/15 text-ios-blue' :
                                        'bg-ios-orange/15 text-ios-orange'
                                      }`}>
                                        {s.grade || '—'}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Quick actions */}
                <div className="card">
                  <div className="h-section mb-3">Quick questions</div>
                  <div className="flex flex-wrap gap-2">
                    <QuickAction onClick={() => send('How did I perform in Web Technology and Web Lab?')}>🌐 Web Tech (92%) Review</QuickAction>
                    <QuickAction onClick={() => send('Show all my semester marks and academic transcript.')}>📜 Full Academic Record</QuickAction>
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
            <div className="flex items-center justify-between gap-2">
              <ConversationsSidebar current={conversationId} onPick={setConversationId} onNew={newChat} />
              <button
                onClick={() => setShowSettings(true)}
                className="chip text-[11px] opacity-80 hover:opacity-100 shrink-0 flex items-center gap-1"
                title="Configure AI model"
              >
                <Settings size={12} />
                <span>{aiSettings.provider === 'local' ? 'Local Engine' : aiSettings.provider.toUpperCase()}</span>
              </button>
            </div>

            <div className="card !p-0 overflow-hidden flex flex-col h-[70vh] min-h-[480px]">
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
                {messages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6">
                    <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-ios-blue to-ios-purple text-white grid place-items-center mb-3"><Sparkles size={26} /></div>
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
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />{streamErr}
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
                    {streaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </form>
                <div className="flex items-center justify-between text-[10px] opacity-60 mt-1 px-1">
                  <span>Calculations backed by official university scale (10.0 scale).</span>
                  <button onClick={() => setShowSettings(true)} className="hover:underline flex items-center gap-1">
                    <span>Engine: {currentProviderLabel}</span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Settings Modal */}
      {showSettings && (
        <AiSettingsModal
          settings={aiSettings}
          onSave={(newSet) => {
            saveAiSettings(newSet);
            setAiSettingsState(newSet);
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
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
        {isUser ? <User size={14} /> : <Bot size={14} />}
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
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-pulse" />
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-pulse" style={{ animationDelay: '150ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-pulse" style={{ animationDelay: '300ms' }} />
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
            <Target size={15} />
          </div>
          <div>
            <div className="h-section">CGPA Goal Planner</div>
            <div className="text-[11px] opacity-60">
              {completed}/{totalSems} sems done · {remaining} to go
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-ios-blue/10 dark:bg-ios-blue/20 border border-ios-blue/30 px-3 py-1.5 text-xs text-ios-blue font-semibold flex items-center gap-1.5">
          <Sparkles size={13} />
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
                <ArrowRight size={13} className="opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition" />
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
          <Sparkles size={12} /> Get Strategy
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
        <Plus size={12} /> New chat
      </button>
      {convos.map((c: any) => (
        <button key={c.id} onClick={() => onPick(c.id)} className={`chip shrink-0 max-w-[200px] ${current === c.id ? '!bg-ios-blue !text-white !border-transparent' : ''}`}>
          <span className="clip-1">{c.title || 'Chat'}</span>
        </button>
      ))}
    </div>
  );
}

function AiSettingsModal({
  settings,
  onSave,
  onClose,
}: {
  settings: AiSettings;
  onSave: (s: AiSettings) => void;
  onClose: () => void;
}) {
  const [provider, setProvider] = useState<AiProvider>(settings.provider);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const availableForProvider = AVAILABLE_MODELS.filter(m => m.provider === provider);

  const handleProviderChange = (newP: AiProvider) => {
    setProvider(newP);
    setTestResult(null);
    if (newP === 'local') {
      setModel('local-academic');
    } else if (newP === 'openai') {
      setModel('gpt-4o-mini');
    } else if (newP === 'groq') {
      setModel('llama-3.3-70b-versatile');
    } else if (newP === 'gemini') {
      setModel('gemini-3.6-flash');
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const res = await testAiConnection({ provider, apiKey, model });
    setTesting(false);
    setTestResult(res);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ provider, apiKey: apiKey.trim(), model });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm grid place-items-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="card max-w-lg w-full bg-white dark:bg-gray-900 shadow-2xl p-6 relative border border-white/20"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-ios-blue to-ios-purple text-white grid place-items-center">
            <Settings size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold">ERP AI Model Settings</h2>
            <p className="text-xs text-black/60 dark:text-white/60">Configure intelligence provider and custom API keys</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Provider Selection */}
          <div>
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wider text-black/60 dark:text-white/60">
              Intelligence Provider
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleProviderChange('local')}
                className={`p-3 rounded-2xl text-left border text-xs font-medium transition ${
                  provider === 'local'
                    ? 'border-ios-blue bg-ios-blue/10 text-ios-blue font-bold shadow-sm'
                    : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <div className="font-bold text-sm mb-0.5">⚡ Built-in</div>
                <div className="opacity-70 text-[10px]">Local Engine (Offline)</div>
              </button>

              <button
                type="button"
                onClick={() => handleProviderChange('openai')}
                className={`p-3 rounded-2xl text-left border text-xs font-medium transition relative ${
                  provider === 'openai'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold shadow-sm'
                    : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <span className="absolute top-1.5 right-2 text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full font-bold">ChatGPT</span>
                <div className="font-bold text-sm mb-0.5">🤖 OpenAI</div>
                <div className="opacity-70 text-[10px]">GPT-4o / GPT-4o mini</div>
              </button>

              <button
                type="button"
                onClick={() => handleProviderChange('groq')}
                className={`p-3 rounded-2xl text-left border text-xs font-medium transition ${
                  provider === 'groq'
                    ? 'border-ios-blue bg-ios-blue/10 text-ios-blue font-bold shadow-sm'
                    : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <div className="font-bold text-sm mb-0.5">🚀 Groq</div>
                <div className="opacity-70 text-[10px]">Llama 3.3 / Ultra Fast</div>
              </button>

              <button
                type="button"
                onClick={() => handleProviderChange('gemini')}
                className={`p-3 rounded-2xl text-left border text-xs font-medium transition ${
                  provider === 'gemini'
                    ? 'border-ios-blue bg-ios-blue/10 text-ios-blue font-bold shadow-sm'
                    : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <div className="font-bold text-sm mb-0.5">✨ Gemini</div>
                <div className="opacity-70 text-[10px]">Google Flash 3.6</div>
              </button>
            </div>
          </div>

          {/* API Key Input for Cloud Providers */}
          {provider !== 'local' && (
            <div>
            <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-black/60 dark:text-white/60">
                  {provider === 'openai' ? 'OpenAI API Key' : provider === 'groq' ? 'Groq API Key' : 'Gemini API Key'}
                </label>
                <a
                  href={
                    provider === 'openai' ? 'https://platform.openai.com/api-keys' :
                    provider === 'groq' ? 'https://console.groq.com/keys' :
                    'https://aistudio.google.com/app/apikey'
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-ios-blue hover:underline flex items-center gap-0.5"
                >
                  Get free key <ExternalLink size={10} />
                </a>
              </div>
              <div className="relative">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={provider === 'openai' ? 'sk-...' : provider === 'groq' ? 'gsk_...' : 'AIzaSy...'}
                  className="w-full h-11 px-3.5 pr-10 rounded-2xl border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 text-sm outline-none focus:ring-2 ring-ios-blue font-mono"
                />
                <KeyRound size={16} className="absolute right-3.5 top-3.5 opacity-40" />
              </div>
              <p className="text-[11px] opacity-60 mt-1">
                Keys are stored locally in your browser and never shared.
              </p>
            </div>
          )}

          {/* Model Selection */}
          <div>
            <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider text-black/60 dark:text-white/60">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full h-11 px-3 rounded-2xl border border-black/15 dark:border-white/15 bg-white/70 dark:bg-gray-800 text-sm outline-none focus:ring-2 ring-ios-blue"
            >
              {availableForProvider.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Test Status Banner */}
          {testResult && (
            <div className={`p-3 rounded-2xl text-xs flex items-start gap-2 ${
              testResult.ok
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-ios-red/10 border border-ios-red/30 text-ios-red'
            }`}>
              {testResult.ok ? <Check size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-between gap-3">
            {provider !== 'local' ? (
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !apiKey.trim()}
                className="h-11 px-4 rounded-2xl bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-xs font-bold transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {testing && <Loader2 size={14} className="animate-spin" />}
                Test Key
              </button>
            ) : (
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                ✓ Ready for offline usage
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-11 px-4 rounded-2xl bg-black/5 dark:bg-white/10 hover:bg-black/10 text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-11 px-5 rounded-2xl btn-primary text-xs font-bold flex items-center gap-1.5 shadow-md"
              >
                Save Settings
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
