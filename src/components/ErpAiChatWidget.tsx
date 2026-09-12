import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Send, X, Minimize2, Maximize2, Settings, Bot, User,
  Loader2, Check, AlertCircle, ExternalLink
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import MarkdownRenderer from './MarkdownRenderer';
import {
  streamChat, getAiSettings, saveAiSettings, testAiConnection,
  fetchSnapshot, type AiSnapshot, type AiSettings, type AiProvider
} from '../lib/erpAi';

type Msg = { role: 'user' | 'assistant'; content: string; engine?: string };

export default function ErpAiChatWidget() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      content: `👋 Hi **${user?.displayName?.split(' ')[0] || 'there'}**! I am **ERP AI**, your academic chatbot assistant.\n\nAsk me anything about your **CGPA goals**, **marks & transcript**, **attendance safety**, **Sem 5 faculty**, or **exam blueprints**!`
    }
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => getAiSettings());
  const [snapshot, setSnapshot] = useState<AiSnapshot | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load snapshot in background for context
  useEffect(() => {
    if (user) {
      fetchSnapshot().then(snap => setSnapshot(snap)).catch(() => {});
    }
  }, [user]);

  // Auto scroll to bottom of messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming, isOpen]);

  // Only render for students
  if (user?.role !== 'student') {
    return null;
  }

  const handleSend = async (customText?: string) => {
    const q = (customText ?? input).trim();
    if (!q || streaming) return;
    setInput('');
    if (isMinimized) setIsMinimized(false);

    setMessages(prev => [...prev, { role: 'user', content: q }, { role: 'assistant', content: '' }]);
    setStreaming(true);

    try {
      await streamChat({
        message: q,
        conversationId: `widget_${user?.id || 'guest'}_${Date.now()}`,
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
          }
        },
      });
    } catch (err: any) {
      setMessages(prev => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last && last.role === 'assistant') {
          copy[copy.length - 1] = {
            ...last,
            content: last.content || "I'm having trouble processing that right now. Please try asking again!"
          };
        }
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  };

  const currentProviderLabel = aiSettings.provider === 'local'
    ? 'Built-in Engine'
    : aiSettings.provider === 'groq'
    ? 'Groq LLM'
    : aiSettings.provider === 'gemini'
    ? 'Google Gemini'
    : 'ChatGPT (OpenAI)';

  return (
    <>
      {/* Floating Trigger Button */}
      {!isOpen && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className="fixed bottom-20 md:bottom-6 right-5 md:right-7 z-40"
        >
          <button
            onClick={() => setIsOpen(true)}
            className="group relative flex items-center gap-2.5 px-4 py-3 rounded-full text-white shadow-2xl hover:shadow-ios-blue/40 transition-all duration-300 hover:scale-105 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #307DFF 0%, #3C3DFF 50%, #7F23FF 100%)',
            }}
          >
            {/* Pulsing halo */}
            <span className="absolute -inset-1 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 opacity-40 blur-md group-hover:opacity-75 animate-pulse transition duration-500" />

            <div className="relative flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-white/20 backdrop-blur grid place-items-center">
                <Sparkles size={16} className="text-white animate-spin-slow" />
              </div>
              <span className="font-semibold text-sm tracking-wide">ERP AI</span>
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-white/50 animate-pulse" />
            </div>
          </button>
        </motion.div>
      )}

      {/* Floating Chatbot Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              height: isMinimized ? 'auto' : '560px',
            }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-20 md:bottom-6 right-4 md:right-7 z-50 w-[92vw] sm:w-[420px] max-w-[440px] flex flex-col rounded-3xl overflow-hidden border border-black/10 dark:border-white/10 shadow-2xl backdrop-blur-2xl bg-white/95 dark:bg-[#1a1c23]/95 text-gray-900 dark:text-gray-100"
          >
            {/* Header */}
            <div
              className="p-3.5 text-white flex items-center justify-between gap-2 shrink-0 select-none cursor-pointer"
              style={{
                background: 'linear-gradient(120deg, #307DFF 0%, #3C3DFF 55%, #7F23FF 100%)',
              }}
              onClick={() => isMinimized && setIsMinimized(false)}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-xl bg-white/20 backdrop-blur grid place-items-center shrink-0">
                  <Sparkles size={16} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 leading-none">
                    <span className="font-bold text-sm">ERP AI Assistant</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                  <div className="text-[11px] opacity-80 mt-0.5 clip-1">
                    {snapshot ? `${snapshot.student.course} Sem ${snapshot.student.semester} · ${currentProviderLabel}` : currentProviderLabel}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  className="h-7 w-7 rounded-lg bg-white/15 hover:bg-white/25 transition grid place-items-center text-white"
                  title="Configure AI Model"
                >
                  <Settings size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    nav('/erp-ai');
                  }}
                  className="h-7 w-7 rounded-lg bg-white/15 hover:bg-white/25 transition grid place-items-center text-white"
                  title="Open Full Screen AI Dashboard"
                >
                  <ExternalLink size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsMinimized(prev => !prev)}
                  className="h-7 w-7 rounded-lg bg-white/15 hover:bg-white/25 transition grid place-items-center text-white"
                  title={isMinimized ? 'Expand' : 'Minimize'}
                >
                  {isMinimized ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="h-7 w-7 rounded-lg bg-white/15 hover:bg-white/25 transition grid place-items-center text-white"
                  title="Close"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Content (Hidden when minimized) */}
            {!isMinimized && (
              <>
                {/* Message Stream */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
                  {messages.map((m, i) => {
                    const isUser = m.role === 'user';
                    return (
                      <div key={i} className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
                        <div
                          className={`h-7 w-7 rounded-full grid place-items-center shrink-0 text-xs ${
                            isUser
                              ? 'bg-ios-blue text-white'
                              : 'bg-gradient-to-br from-ios-blue to-ios-purple text-white shadow-sm'
                          }`}
                        >
                          {isUser ? <User size={13} /> : <Bot size={13} />}
                        </div>
                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-[13px] leading-relaxed shadow-sm ${
                            isUser
                              ? 'bg-ios-blue text-white rounded-tr-sm whitespace-pre-wrap'
                              : 'bg-black/5 dark:bg-white/[0.06] rounded-tl-sm border border-black/5 dark:border-white/10'
                          }`}
                        >
                          {m.content ? (
                            isUser ? (
                              m.content
                            ) : (
                              <MarkdownRenderer content={m.content} />
                            )
                          ) : (
                            <div className="flex items-center gap-1.5 py-1 text-ios-blue">
                              <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                              <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse delay-100" />
                              <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse delay-200" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Quick Prompts Carousel */}
                <div className="px-3 py-1.5 border-t border-black/5 dark:border-white/5 flex gap-1.5 overflow-x-auto no-scrollbar bg-black/[0.02] dark:bg-white/[0.02]">
                  <button
                    type="button"
                    onClick={() => handleSend('How can I reach 8.0 CGPA and what is the best strategy to maximize my score?')}
                    className="chip shrink-0 !text-[11px] !py-1 !px-2.5 hover:!bg-ios-blue/10 hover:!text-ios-blue hover:!border-ios-blue/30"
                  >
                    🎯 CGPA Goal
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend('How did I perform in Web Technology and Web Lab?')}
                    className="chip shrink-0 !text-[11px] !py-1 !px-2.5 hover:!bg-ios-blue/10 hover:!text-ios-blue hover:!border-ios-blue/30"
                  >
                    🌐 Web Tech (92%)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend('What is my attendance status and how many classes can I miss?')}
                    className="chip shrink-0 !text-[11px] !py-1 !px-2.5 hover:!bg-ios-blue/10 hover:!text-ios-blue hover:!border-ios-blue/30"
                  >
                    🕒 Attendance
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend('Who teaches Semester 5 subjects?')}
                    className="chip shrink-0 !text-[11px] !py-1 !px-2.5 hover:!bg-ios-blue/10 hover:!text-ios-blue hover:!border-ios-blue/30"
                  >
                    👨‍🏫 Faculty
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend('Give me a 7-day study plan for Semester 5.')}
                    className="chip shrink-0 !text-[11px] !py-1 !px-2.5 hover:!bg-ios-blue/10 hover:!text-ios-blue hover:!border-ios-blue/30"
                  >
                    📅 7-Day Plan
                  </button>
                </div>

                {/* Composer */}
                <div className="p-3 border-t border-black/5 dark:border-white/10 bg-white/70 dark:bg-[#1f222b]/90">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSend();
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={streaming ? 'AI is thinking…' : 'Ask about marks, CGPA, exams, syllabus…'}
                      disabled={streaming}
                      className="flex-1 h-9 px-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs outline-none focus:ring-2 ring-ios-blue/40"
                    />
                    <button
                      type="submit"
                      disabled={streaming || !input.trim()}
                      className="h-9 w-9 rounded-xl bg-ios-blue text-white grid place-items-center hover:opacity-90 disabled:opacity-40 transition shrink-0"
                    >
                      {streaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </button>
                  </form>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      {showSettings && (
        <WidgetSettingsModal
          settings={aiSettings}
          onSave={(newSet) => {
            saveAiSettings(newSet);
            setAiSettings(newSet);
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}

function WidgetSettingsModal({
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

  const handleProviderChange = (newP: AiProvider) => {
    setProvider(newP);
    setTestResult(null);
    if (newP === 'local') setModel('local-academic');
    else if (newP === 'openai') setModel('gpt-4o-mini');
    else if (newP === 'groq') setModel('llama-3.3-70b-versatile');
    else if (newP === 'gemini') setModel('gemini-3.6-flash');
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const res = await testAiConnection({ provider, apiKey, model });
    setTesting(false);
    setTestResult(res);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm grid place-items-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="max-w-md w-full rounded-3xl p-5 bg-white dark:bg-[#1c1e24] shadow-2xl border border-white/20 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-ios-blue text-white grid place-items-center">
              <Settings size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold">AI Chatbot Engine</h3>
              <p className="text-[11px] opacity-60">Configure intelligence engine & API keys</p>
            </div>
          </div>
          <button onClick={onClose} className="h-7 w-7 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 grid place-items-center opacity-70">
            <X size={16} />
          </button>
        </div>

        {/* Provider Switcher */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => handleProviderChange('local')}
            className={`p-2.5 rounded-xl border text-left transition ${
              provider === 'local' ? 'border-ios-blue bg-ios-blue/10 text-ios-blue font-bold' : 'border-black/10 dark:border-white/10'
            }`}
          >
            <div className="font-semibold">⚡ Built-in Engine</div>
            <div className="text-[10px] opacity-70">Fast, local, no key needed</div>
          </button>

          <button
            type="button"
            onClick={() => handleProviderChange('gemini')}
            className={`p-2.5 rounded-xl border text-left transition ${
              provider === 'gemini' ? 'border-ios-blue bg-ios-blue/10 text-ios-blue font-bold' : 'border-black/10 dark:border-white/10'
            }`}
          >
            <div className="font-semibold">✨ Google Gemini</div>
            <div className="text-[10px] opacity-70">Free tier available</div>
          </button>

          <button
            type="button"
            onClick={() => handleProviderChange('groq')}
            className={`p-2.5 rounded-xl border text-left transition ${
              provider === 'groq' ? 'border-ios-blue bg-ios-blue/10 text-ios-blue font-bold' : 'border-black/10 dark:border-white/10'
            }`}
          >
            <div className="font-semibold">⚡ Groq Cloud</div>
            <div className="text-[10px] opacity-70">Ultra fast Llama 3.3</div>
          </button>

          <button
            type="button"
            onClick={() => handleProviderChange('openai')}
            className={`p-2.5 rounded-xl border text-left transition ${
              provider === 'openai' ? 'border-ios-blue bg-ios-blue/10 text-ios-blue font-bold' : 'border-black/10 dark:border-white/10'
            }`}
          >
            <div className="font-semibold">🤖 ChatGPT / OpenAI</div>
            <div className="text-[10px] opacity-70">GPT-4o Mini</div>
          </button>
        </div>

        {/* API Key Input */}
        {provider !== 'local' && (
          <div className="space-y-1.5 text-xs">
            <label className="font-semibold text-[11px] opacity-80">
              {provider.toUpperCase()} API Key:
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={`Paste your ${provider} API key here...`}
              className="w-full h-9 px-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs outline-none focus:ring-2 ring-ios-blue/50"
            />
            <div className="text-[10px] opacity-60">
              {provider === 'gemini' && 'Get free Gemini API key: aistudio.google.com/app/apikey'}
              {provider === 'groq' && 'Get free Groq API key: console.groq.com/keys'}
              {provider === 'openai' && 'Get OpenAI API key: platform.openai.com/api-keys'}
            </div>
          </div>
        )}

        {/* Test Result */}
        {testResult && (
          <div
            className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
              testResult.ok ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
            }`}
          >
            {testResult.ok ? <Check size={14} /> : <AlertCircle size={14} />}
            <span className="clip-1">{testResult.message}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-black/5 dark:border-white/10">
          {provider !== 'local' && (
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !apiKey.trim()}
              className="h-8 px-3 rounded-xl border border-black/10 dark:border-white/10 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40"
            >
              {testing ? 'Testing…' : 'Test Key'}
            </button>
          )}

          <button
            type="button"
            onClick={() => onSave({ provider, apiKey: apiKey.trim(), model })}
            className="h-8 px-4 rounded-xl bg-ios-blue text-white text-xs font-bold hover:opacity-90 ml-auto"
          >
            Save Settings
          </button>
        </div>
      </motion.div>
    </div>
  );
}
