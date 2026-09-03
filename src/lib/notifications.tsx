/**
 * Campus ERP — Real-Time Notification Engine.
 *
 * Full multi-tenant, real-time notification engine connecting Supabase Realtime
 * Broadcast + Postgres Changes + Local Cross-tab synchronization.
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase, HAS_SUPABASE } from './supabase';
import { useAuth } from './auth';

export type NotificationType =
  | 'note'
  | 'notice'
  | 'attendance'
  | 'academic'
  | 'leave'
  | 'timetable'
  | 'announcement'
  | 'system';

export interface ErpNotification {
  id: string;
  college_id?: string;
  user_id?: string;
  student_id?: string;
  teacher_id?: string;
  role_scope?: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  entity_id?: string;
  entity_type?: string;
  metadata?: any;
  is_read: boolean;
  created_at: string;
  read_at?: string;
}

export interface SendNotificationParams {
  college_id: string;
  user_id?: string;
  student_id?: string;
  teacher_id?: string;
  role_scope?: 'student' | 'teacher' | 'admin' | 'all';
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  entity_id?: string;
  entity_type?: string;
  metadata?: any;
}

interface NotificationContextType {
  notifications: ErpNotification[];
  unreadCount: number;
  isLoading: boolean;
  sendNotification: (params: SendNotificationParams) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearAll: () => Promise<void>;
  requestBrowserPermission: () => Promise<boolean>;
  activeToast: ErpNotification | null;
  dismissToast: () => void;
  refetch: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

const STORAGE_KEY = 'campus_erp_notifications_cache_v4';
const BROADCAST_CHANNEL_NAME = 'campus_erp_live_notifications_channel';

// Helper to send notifications from anywhere in the app
export async function dispatchErpNotification(params: SendNotificationParams) {
  const notif: ErpNotification = {
    id: 'n_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now(),
    college_id: params.college_id,
    user_id: params.user_id,
    student_id: params.student_id,
    teacher_id: params.teacher_id,
    role_scope: params.role_scope,
    type: params.type,
    title: params.title,
    message: params.message,
    link: params.link,
    entity_id: params.entity_id,
    entity_type: params.entity_type,
    metadata: params.metadata,
    is_read: false,
    created_at: new Date().toISOString(),
  };

  // 1. Supabase Realtime Broadcast to all connected clients
  if (HAS_SUPABASE && supabase) {
    try {
      const channel = supabase.channel(BROADCAST_CHANNEL_NAME);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.send({
            type: 'broadcast',
            event: 'new_notification',
            payload: notif,
          });
        }
      });

      // 2. Persist in database
      await supabase.from('notifications').insert({
        college_id: params.college_id,
        user_id: params.user_id || null,
        role_scope: (params.role_scope as any) || null,
        title: params.title,
        body: params.message,
        category: params.type,
        is_read: false,
      });
    } catch (e) {
      console.warn('[Notifications] Broadcast/Insert warning:', e);
    }
  }

  // 3. Local cross-tab broadcast via window CustomEvent and localStorage
  try {
    window.dispatchEvent(new CustomEvent('campus_notification_dispatched', { detail: notif }));
  } catch { /* ignore */ }

  return notif;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<ErpNotification[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [activeToast, setActiveToast] = useState<ErpNotification | null>(null);
  const toastTimerRef = useRef<any>(null);

  const showToast = useCallback((n: ErpNotification) => {
    setActiveToast(n);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setActiveToast(null);
    }, 6500);

    // Native Browser Push Notification
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`Campus ERP · ${n.title}`, {
          body: n.message,
          icon: '/brand-icon.png',
          tag: n.id,
        });
      } catch { /* ignore */ }
    }
  }, []);

  const dismissToast = useCallback(() => {
    setActiveToast(null);
  }, []);

  // Check if a notification is meant for the logged-in user
  const isNotificationForMe = useCallback(
    (n: ErpNotification | any) => {
      if (!user) return false;
      if (n.college_id && user.college_id && n.college_id !== user.college_id) return false;
      if (n.user_id && n.user_id === user.id) return true;

      const studentId = user.student?.id || (user.student as any)?.db_id;
      if (user.role === 'student') {
        if (n.teacher_id) return false;
        if (n.role_scope && n.role_scope !== 'student' && n.role_scope !== 'all') return false;
        if (n.student_id && studentId && n.student_id !== studentId) return false;
        return true;
      }

      if (user.role === 'teacher') {
        if (n.student_id && !n.teacher_id && n.role_scope === 'student') return false;
        if (n.role_scope && n.role_scope !== 'teacher' && n.role_scope !== 'all') return false;
        return true;
      }

      return true;
    },
    [user]
  );

  // Fetch real notifications from Supabase table
  const fetchNotifications = useCallback(async () => {
    if (!HAS_SUPABASE || !supabase || !user?.college_id) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('college_id', user.college_id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        const mapped: ErpNotification[] = data.map((row: any) => ({
          id: row.id,
          college_id: row.college_id,
          user_id: row.user_id,
          student_id: row.student_id,
          teacher_id: row.teacher_id,
          role_scope: row.role_scope,
          type: (row.category || row.type || 'system') as NotificationType,
          title: row.title,
          message: row.body || row.message || '',
          link: row.link,
          entity_id: row.entity_id,
          entity_type: row.entity_type,
          metadata: row.metadata,
          is_read: !!row.is_read,
          created_at: row.created_at,
          read_at: row.read_at,
        }));

        const filtered = mapped.filter(isNotificationForMe);

        setNotifications((prev) => {
          // Merge with any local broadcast not yet synced
          const combined = [...prev];
          for (const item of filtered) {
            const idx = combined.findIndex((c) => c.id === item.id);
            if (idx === -1) combined.push(item);
            else combined[idx] = { ...combined[idx], ...item };
          }
          combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(combined));
          } catch { /* ignore */ }
          return combined;
        });
      }
    } catch (e) {
      console.warn('[Notifications] Fetch failed:', e);
    } finally {
      setIsLoading(false);
    }
  }, [user, isNotificationForMe]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time Supabase Broadcast + Postgres Changes Listener
  useEffect(() => {
    if (!HAS_SUPABASE || !supabase || !user?.college_id) return;

    const channel = supabase.channel(BROADCAST_CHANNEL_NAME);

    channel
      .on('broadcast', { event: 'new_notification' }, (payload) => {
        const notif = payload.payload as ErpNotification;
        if (isNotificationForMe(notif)) {
          setNotifications((prev) => {
            const next = [notif, ...prev.filter((p) => p.id !== notif.id)];
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch { /* ignore */ }
            return next;
          });
          showToast(notif);
        }
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `college_id=eq.${user.college_id}`,
        },
        (payload) => {
          const row = payload.new as any;
          const notif: ErpNotification = {
            id: row.id,
            college_id: row.college_id,
            user_id: row.user_id,
            student_id: row.student_id,
            teacher_id: row.teacher_id,
            role_scope: row.role_scope,
            type: (row.category || row.type || 'system') as NotificationType,
            title: row.title,
            message: row.body || row.message || '',
            link: row.link,
            entity_id: row.entity_id,
            entity_type: row.entity_type,
            metadata: row.metadata,
            is_read: false,
            created_at: row.created_at || new Date().toISOString(),
          };

          if (isNotificationForMe(notif)) {
            setNotifications((prev) => {
              const next = [notif, ...prev.filter((p) => p.id !== notif.id)];
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
              } catch { /* ignore */ }
              return next;
            });
            showToast(notif);
          }
        }
      )
      .subscribe();

    // Local custom event listener
    const onLocalEvent = (e: any) => {
      const notif = e.detail as ErpNotification;
      if (isNotificationForMe(notif)) {
        setNotifications((prev) => {
          const next = [notif, ...prev.filter((p) => p.id !== notif.id)];
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch { /* ignore */ }
          return next;
        });
        showToast(notif);
      }
    };
    window.addEventListener('campus_notification_dispatched', onLocalEvent);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('campus_notification_dispatched', onLocalEvent);
    };
  }, [user, isNotificationForMe, showToast]);

  // Send a new notification
  const sendNotification = async (params: SendNotificationParams) => {
    const notif = await dispatchErpNotification(params);
    if (isNotificationForMe(notif)) {
      setNotifications((prev) => [notif, ...prev.filter((p) => p.id !== notif.id)]);
      showToast(notif);
    }
  };

  // Mark single as read
  const markAsRead = async (id: string) => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
    if (HAS_SUPABASE && supabase) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
    if (HAS_SUPABASE && supabase && unreadIds.length > 0) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', unreadIds);
    }
  };

  // Clear all notifications
  const clearAll = async () => {
    setNotifications([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const requestBrowserPermission = async () => {
    if (!('Notification' in window)) return false;
    const res = await Notification.requestPermission();
    return res === 'granted';
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        sendNotification,
        markAsRead,
        markAllAsRead,
        clearAll,
        requestBrowserPermission,
        activeToast,
        dismissToast,
        refetch: fetchNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
