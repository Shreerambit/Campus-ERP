/**
 * Campus ERP — Real-Time Notification Engine.
 *
 * Connects directly to Supabase `public.notifications` table with live subscriptions.
 * Supports targeted student/teacher alerts, read/unread states, in-app animated toasts,
 * and browser push notifications.
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

interface NotificationContextType {
  notifications: ErpNotification[];
  unreadCount: number;
  isLoading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearAll: () => Promise<void>;
  requestBrowserPermission: () => Promise<boolean>;
  activeToast: ErpNotification | null;
  dismissToast: () => void;
  refetch: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

const STORAGE_KEY = 'campus_erp_notifications_cache';

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
    }, 6000);

    // Native Browser Notification
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

  // Fetch real notifications from Supabase
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
          type: (row.type || row.category || 'system') as NotificationType,
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

        // Filter notifications relevant to current user role and identity
        const studentId = user.student?.id;
        const filtered = mapped.filter(n => {
          if (n.user_id && n.user_id === user.id) return true;
          if (user.role === 'student') {
            return !n.teacher_id && (!n.student_id || n.student_id === studentId);
          }
          if (user.role === 'teacher') {
            return !n.student_id;
          }
          return true;
        });

        setNotifications(filtered);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
        } catch { /* ignore */ }
      }
    } catch (e) {
      console.warn('[Notifications] Fetch failed:', e);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Initial fetch and on user change
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time Supabase Subscription
  useEffect(() => {
    if (!HAS_SUPABASE || !supabase || !user?.college_id) return;

    const collegeId = user.college_id;
    const studentId = user.student?.id;

    const channel = supabase
      .channel('campus-live-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `college_id=eq.${collegeId}`,
        },
        (payload) => {
          const row = payload.new as any;
          const isForMe =
            (row.user_id && row.user_id === user.id) ||
            (user.role === 'student' && !row.teacher_id && (!row.student_id || row.student_id === studentId)) ||
            (user.role === 'teacher' && !row.student_id) ||
            user.role === 'admin' ||
            user.role === 'super';

          if (isForMe) {
            const newNotif: ErpNotification = {
              id: row.id,
              college_id: row.college_id,
              user_id: row.user_id,
              student_id: row.student_id,
              teacher_id: row.teacher_id,
              type: (row.type || row.category || 'system') as NotificationType,
              title: row.title,
              message: row.body || row.message || '',
              link: row.link,
              entity_id: row.entity_id,
              entity_type: row.entity_type,
              metadata: row.metadata,
              is_read: false,
              created_at: row.created_at || new Date().toISOString(),
            };

            setNotifications((prev) => [newNotif, ...prev.filter((p) => p.id !== newNotif.id)]);
            showToast(newNotif);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, showToast]);

  // Mark single as read
  const markAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
    );
    if (HAS_SUPABASE && supabase) {
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
    );
    if (HAS_SUPABASE && supabase && unreadIds.length > 0) {
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
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
