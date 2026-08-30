import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, CheckCheck, Trash2, BookOpen, Megaphone,
  ClipboardCheck, GraduationCap, X, ChevronRight, Sparkles,
  CalendarDays, FileSignature, RefreshCw, Check
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, type ErpNotification, type NotificationType } from '../lib/notifications';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / (1000 * 60));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getIcon(type: NotificationType) {
  switch (type) {
    case 'note':
      return <BookOpen size={16} className="text-ios-purple" />;
    case 'notice':
      return <Megaphone size={16} className="text-ios-orange" />;
    case 'attendance':
      return <ClipboardCheck size={16} className="text-ios-green" />;
    case 'academic':
      return <GraduationCap size={16} className="text-ios-blue" />;
    case 'leave':
      return <FileSignature size={16} className="text-teal-500" />;
    case 'timetable':
      return <CalendarDays size={16} className="text-sky-500" />;
    default:
      return <Sparkles size={16} className="text-ios-blue" />;
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'note' | 'attendance' | 'notice'>('all');
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead, clearAll, requestBrowserPermission, refetch } = useNotifications();
  const nav = useNavigate();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click (desktop)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Lock body scroll on mobile when sheet is open
  useEffect(() => {
    if (open && window.innerWidth < 768) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [open]);

  const handleItemClick = (n: ErpNotification) => {
    markAsRead(n.id);
    setOpen(false);
    if (n.link) nav(n.link);
  };

  const filteredNotifications = useMemo(() => {
    if (filter === 'unread') return notifications.filter(n => !n.is_read);
    if (filter === 'all') return notifications;
    return notifications.filter(n => n.type === filter);
  }, [notifications, filter]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className={`h-9 w-9 rounded-full transition grid place-items-center relative hover:scale-105 active:scale-95
          ${open ? 'bg-ios-blue text-white shadow-md' : 'glass hover:bg-white/80 dark:hover:bg-white/15'}`}
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell size={16} className={unreadCount > 0 ? (open ? 'text-white' : 'text-ios-blue') : 'opacity-70'} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-ios-red text-white text-[9px] font-bold grid place-items-center shadow-md animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* RENDER VIA PORTAL DIRECTLY INTO BODY TO PREVENT CSS PARENT TRAPPING */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && (
              <>
                {/* 1. Backdrop Overlay (Mobile & Desktop Dim) */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setOpen(false)}
                  className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm"
                />

                {/* 2. Container (Mobile: Anchored to Bottom / Desktop: Floating Top-Right) */}
                <div className="fixed inset-0 z-[10000] pointer-events-none flex flex-col justify-end md:justify-start md:items-end md:p-6">
                  <motion.div
                    ref={dropdownRef}
                    initial={{ opacity: 0, y: 30, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 30, scale: 0.95 }}
                    transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                    className="
                      pointer-events-auto w-full max-h-[85vh] md:w-[420px] md:max-h-[80vh]
                      bg-white dark:bg-[#0f172a] rounded-t-[32px] md:rounded-[28px]
                      shadow-[0_25px_70px_-15px_rgba(0,0,0,0.6)]
                      border border-black/10 dark:border-white/15
                      flex flex-col overflow-hidden
                    "
                    style={{
                      paddingBottom: 'env(safe-area-inset-bottom)',
                    }}
                  >
                    {/* Mobile Drag Indicator */}
                    <div className="md:hidden pt-3 pb-1 flex justify-center">
                      <div className="w-12 h-1.5 rounded-full bg-black/20 dark:bg-white/20" />
                    </div>

                    {/* Header */}
                    <div className="px-4 py-3.5 border-b border-black/5 dark:border-white/10 flex items-center justify-between bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-xl bg-ios-blue/15 text-ios-blue grid place-items-center shadow-sm">
                          <Bell size={15} />
                        </div>
                        <div>
                          <div className="font-bold text-sm text-gray-900 dark:text-white">Campus Notifications</div>
                          <div className="text-[10px] opacity-60">
                            {unreadCount > 0 ? `${unreadCount} unread alerts` : 'All caught up'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => refetch()}
                          className="h-8 w-8 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 grid place-items-center text-gray-500"
                          title="Refresh notifications"
                        >
                          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
                        </button>
                        {unreadCount > 0 && (
                          <button
                            onClick={markAllAsRead}
                            className="chip !text-[10px] !py-1 !px-2.5 hover:bg-black/5 dark:hover:bg-white/10 text-ios-blue font-semibold"
                            title="Mark all as read"
                          >
                            <CheckCheck size={11} /> Read all
                          </button>
                        )}
                        {notifications.length > 0 && (
                          <button
                            onClick={clearAll}
                            className="h-8 w-8 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 grid place-items-center text-gray-400 hover:text-ios-red"
                            title="Clear notifications"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => setOpen(false)}
                          className="h-8 w-8 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 grid place-items-center text-gray-400"
                          title="Close"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Filter Tabs */}
                    <div className="px-3 py-2 border-b border-black/5 dark:border-white/10 flex items-center gap-1.5 overflow-x-auto no-scrollbar bg-gray-50/40 dark:bg-slate-900/40">
                      {(['all', 'unread', 'note', 'attendance', 'notice'] as const).map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setFilter(cat)}
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold transition capitalize whitespace-nowrap
                            ${filter === cat
                              ? 'bg-ios-blue text-white shadow-sm'
                              : 'bg-black/5 dark:bg-white/5 opacity-70 hover:opacity-100 text-gray-700 dark:text-gray-200'}`}
                        >
                          {cat === 'all' ? 'All' : cat === 'unread' ? `Unread (${unreadCount})` : cat}
                        </button>
                      ))}
                    </div>

                    {/* Notification List */}
                    <div className="overflow-y-auto p-2.5 space-y-1.5 flex-1 max-h-[380px] md:max-h-[440px] no-scrollbar divide-y divide-black/5 dark:divide-white/5">
                      {filteredNotifications.length === 0 ? (
                        <div className="py-14 text-center">
                          <Bell size={36} className="mx-auto opacity-20 mb-2.5" />
                          <div className="text-sm font-semibold opacity-70">No notifications</div>
                          <div className="text-xs opacity-50 mt-0.5">
                            {filter === 'unread' ? 'All notifications have been read!' : 'No updates in this category.'}
                          </div>
                        </div>
                      ) : (
                        filteredNotifications.map((n) => (
                          <div
                            key={n.id}
                            onClick={() => handleItemClick(n)}
                            className={`group relative p-3 rounded-2xl transition cursor-pointer flex items-start gap-3 pt-2.5
                              ${!n.is_read
                                ? 'bg-ios-blue/10 dark:bg-ios-blue/20 hover:bg-ios-blue/15'
                                : 'hover:bg-black/5 dark:hover:bg-white/5'
                              }`}
                          >
                            <div className="h-9 w-9 rounded-2xl bg-white dark:bg-white/10 grid place-items-center shrink-0 shadow-sm mt-0.5 border border-black/5 dark:border-white/10">
                              {getIcon(n.type)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1">
                                <span className={`text-xs font-semibold clip-1 ${!n.is_read ? 'text-ios-blue dark:text-sky-300 font-bold' : 'text-gray-900 dark:text-white'}`}>
                                  {n.title}
                                </span>
                                <span className="text-[10px] opacity-50 shrink-0 tabular-nums">{timeAgo(n.created_at)}</span>
                              </div>
                              <p className="text-xs opacity-75 mt-0.5 leading-snug break-words line-clamp-2 text-gray-700 dark:text-gray-300">
                                {n.message}
                              </p>
                            </div>
                            {!n.is_read && (
                              <div className="flex items-center gap-1.5 shrink-0 mt-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markAsRead(n.id);
                                  }}
                                  className="h-6 w-6 rounded-full hover:bg-ios-blue hover:text-white text-gray-400 grid place-items-center transition"
                                  title="Mark as read"
                                >
                                  <Check size={12} />
                                </button>
                                <span className="h-2 w-2 rounded-full bg-ios-blue" />
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    {/* Footer */}
                    <div className="p-3 border-t border-black/5 dark:border-white/10 bg-gray-50/80 dark:bg-slate-900/80 flex items-center justify-between text-xs">
                      <button
                        onClick={async () => {
                          const granted = await requestBrowserPermission();
                          if (granted) alert('System push notifications enabled!');
                          else alert('Please allow notifications in your browser settings.');
                        }}
                        className="text-ios-blue hover:underline font-semibold text-xs flex items-center gap-1"
                      >
                        <Sparkles size={12} /> Enable device alerts
                      </button>
                      <button
                        onClick={() => { setOpen(false); nav('/notices'); }}
                        className="text-gray-600 dark:text-gray-300 hover:text-ios-blue font-semibold text-xs flex items-center gap-0.5"
                      >
                        All notices <ChevronRight size={12} />
                      </button>
                    </div>
                  </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}

/** Floating Live Toast popup when an event happens */
export function NotificationToast() {
  const { activeToast, dismissToast } = useNotifications();
  const nav = useNavigate();

  if (!activeToast) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.9 }}
        className="fixed top-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0 z-[10001] w-[92vw] sm:w-96 rounded-3xl glass shadow-2xl border border-white/80 dark:border-white/20 p-3.5 flex items-start gap-3 backdrop-blur-2xl bg-white/95 dark:bg-gray-900/95"
      >
        <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-ios-blue to-ios-indigo text-white grid place-items-center shrink-0 shadow-md">
          {getIcon(activeToast.type)}
        </div>
        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => {
          dismissToast();
          if (activeToast.link) nav(activeToast.link);
        }}>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ios-blue bg-ios-blue/10 px-1.5 py-0.5 rounded-md">
              {activeToast.type}
            </span>
            <span className="text-[10px] opacity-50">Just now</span>
          </div>
          <div className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white mt-0.5 clip-1">
            {activeToast.title}
          </div>
          <div className="text-[11px] opacity-80 mt-0.5 line-clamp-2 leading-tight text-gray-700 dark:text-gray-300">
            {activeToast.message}
          </div>
        </div>
        <button
          onClick={dismissToast}
          className="h-6 w-6 rounded-full hover:bg-black/5 dark:hover:bg-white/10 grid place-items-center text-gray-400 shrink-0"
        >
          <X size={13} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
