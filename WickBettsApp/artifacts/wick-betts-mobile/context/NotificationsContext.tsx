import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/apiUrl';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: string | null;
  createdAt: string;
}

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
  /** Call when the member opens the notifications screen — clears the badge. */
  markSeen: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

// How often to poll for new alerts while the app is in the foreground. There's
// no push/websocket channel into this context (Expo push only reaches the OS
// tray, not in-app state) — a short poll is the simplest way to make "new
// alerts show up here" true without adding new infra for what is, today, a
// low-frequency feed (signals only, a handful a day at most).
const POLL_INTERVAL_MS = 45_000;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { getToken, isSignedIn } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!isSignedIn) {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoading(false);
      return;
    }
    const token = await getToken();
    if (!token) {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { notifications: AppNotification[]; unreadCount: number };
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // Silent — the bell just keeps showing whatever it last had. Not worth
      // surfacing a toast/alert for a background poll failing occasionally.
    } finally {
      setIsLoading(false);
    }
  }, [getToken, isSignedIn]);

  const markSeen = useCallback(async () => {
    setUnreadCount(0);
    const token = await getToken();
    if (!token) return;
    try {
      await fetch(`${API_BASE}/notifications/seen`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Best-effort — worst case the badge reappears on next refresh, which
      // is a much better failure mode than blocking on this request.
    }
  }, [getToken]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  // Poll only while the app is actually in the foreground.
  useEffect(() => {
    const startPolling = () => {
      if (pollRef.current) return;
      pollRef.current = setInterval(() => void fetchNotifications(), POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    if (AppState.currentState === 'active') startPolling();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        startPolling();
        void fetchNotifications();
      } else {
        stopPolling();
      }
    });

    return () => {
      stopPolling();
      sub.remove();
    };
  }, [fetchNotifications]);

  const value = useMemo(
    () => ({ notifications, unreadCount, isLoading, refresh: fetchNotifications, markSeen }),
    [notifications, unreadCount, isLoading, fetchNotifications, markSeen],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotifications must be used within NotificationsProvider');
  return context;
}
