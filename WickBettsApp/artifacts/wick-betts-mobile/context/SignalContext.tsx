import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/context/AuthContext';

import { API_BASE } from '@/lib/apiUrl';

export type SignalMarket = 'Stocks' | 'Crypto';
export type SignalDirection = 'Long' | 'Short';
export type SignalStatus = 'Active' | 'Watching' | 'Closed' | 'Stopped';
export type OptionType = 'Call' | 'Put';

export interface Signal {
  id: string;
  asset: string;
  market: SignalMarket;
  direction: SignalDirection;
  status: SignalStatus;
  entry: string;
  target: string;
  stop: string;
  timeframe: string;
  risk: string;
  analysis: string;
  postedAt: string;
  isOption: boolean;
  optionType?: OptionType;
  contract?: string;
  expiration?: string;
  strike?: string;
  premium?: string;
  bid?: string;
  ask?: string;
  impliedVolatility?: string;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  openInterest?: string;
}

interface ApiSignal {
  id: string;
  asset: string;
  market: string;
  direction: string;
  status: string;
  entry: string;
  target: string;
  stop: string;
  timeframe: string;
  risk: string;
  analysis: string;
  createdAt: string;
  isOption: boolean;
  optionType?: string;
  contract?: string;
  expiration?: string;
  strike?: string;
  premium?: string;
  bid?: string;
  ask?: string;
  impliedVolatility?: string;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  openInterest?: string;
}

const STORAGE_KEY_PREFIX = '@wick-betts/signals-v2';

function getStorageKey(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

function formatPostedAt(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) {
      const h = date.getHours() % 12 || 12;
      const m = date.getMinutes().toString().padStart(2, '0');
      const ampm = date.getHours() < 12 ? 'AM' : 'PM';
      return `Today, ${h}:${m} ${ampm}`;
    }
    if (diffDays === 1) {
      const h = date.getHours() % 12 || 12;
      const m = date.getMinutes().toString().padStart(2, '0');
      const ampm = date.getHours() < 12 ? 'AM' : 'PM';
      return `Yesterday, ${h}:${m} ${ampm}`;
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return isoString;
  }
}

function mapApiSignal(s: ApiSignal): Signal {
  return {
    id: s.id,
    asset: s.asset,
    market: s.market as SignalMarket,
    direction: s.direction as SignalDirection,
    status: s.status as SignalStatus,
    entry: s.entry,
    target: s.target,
    stop: s.stop,
    timeframe: s.timeframe,
    risk: s.risk,
    analysis: s.analysis,
    postedAt: formatPostedAt(s.createdAt),
    isOption: s.isOption,
    optionType: s.optionType as OptionType | undefined,
    contract: s.contract,
    expiration: s.expiration,
    strike: s.strike,
    premium: s.premium,
    bid: s.bid,
    ask: s.ask,
    impliedVolatility: s.impliedVolatility,
    delta: s.delta,
    gamma: s.gamma,
    theta: s.theta,
    vega: s.vega,
    openInterest: s.openInterest,
  };
}

/** Fields an admin can send when creating or editing a signal. */
export type SignalInput = Omit<Signal, 'id' | 'postedAt'>;

interface SignalContextValue {
  signals: Signal[];
  isLoading: boolean;
  isSubscriptionRequired: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addSignal: (signal: SignalInput) => Promise<void>;
  /** Admin: PATCH an existing signal (full field set or a partial like status). */
  updateSignal: (id: string, patch: Partial<SignalInput>) => Promise<void>;
}

const SignalContext = createContext<SignalContextValue | null>(null);

export function SignalProvider({ children }: { children: ReactNode }) {
  const { getToken, isSignedIn, user } = useAuth();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const storageKey = getStorageKey(user?.id);

  const fetchSignals = useCallback(async () => {
    if (!isSignedIn || !storageKey) {
      setSignals([]);
      setError(null);
      setIsSubscriptionRequired(false);
      setIsLoading(false);
      return;
    }

    const token = await getToken();
    if (!token) {
      setSignals([]);
      setError(null);
      setIsSubscriptionRequired(false);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    setIsSubscriptionRequired(false);
    try {
      const res = await fetch(`${API_BASE}/signals`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        const json = (await res.json()) as { code?: string };
        if (json.code === 'SUBSCRIPTION_REQUIRED') {
          setIsSubscriptionRequired(true);
          setSignals([]);
          // Cache locally so the UI can show something if we had old data
          return;
        }
        throw new Error('Access denied');
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { signals: ApiSignal[] };
      const mapped = json.signals.map(mapApiSignal);
      setSignals(mapped);
      // Cache for offline fallback
      void AsyncStorage.setItem(storageKey, JSON.stringify(mapped));
    } catch (e) {
      setError('Signals unavailable. Pull to refresh.');
      // Load from cache on error
      try {
        const cached = await AsyncStorage.getItem(storageKey);
        if (cached) {
          const parsed = JSON.parse(cached) as Signal[];
          if (Array.isArray(parsed)) setSignals(parsed);
        }
      } catch {
        /* ignore */
      }
    } finally {
      setIsLoading(false);
    }
  }, [getToken, isSignedIn, storageKey]);

  // Refresh when the authenticated user changes so cached member data never
  // leaks between sessions.
  useEffect(() => {
    void fetchSignals();
  }, [fetchSignals, user?.id]);

  const addSignal = useCallback(async (signal: Omit<Signal, 'id' | 'postedAt'>) => {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`${API_BASE}/signals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(signal),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error: string };
      throw new Error(err.error ?? 'Failed to publish signal');
    }
    // Refresh from the server so the newly published signal appears
    await fetchSignals();
  }, [getToken, fetchSignals]);

  const updateSignal = useCallback(async (id: string, patch: Partial<SignalInput>) => {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`${API_BASE}/signals/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? 'Failed to update signal');
    }
    await fetchSignals();
  }, [getToken, fetchSignals]);

  const value = useMemo(
    () => ({ signals, isLoading, isSubscriptionRequired, error, refresh: fetchSignals, addSignal, updateSignal }),
    [signals, isLoading, isSubscriptionRequired, error, fetchSignals, addSignal, updateSignal],
  );

  return <SignalContext.Provider value={value}>{children}</SignalContext.Provider>;
}

export function useSignals() {
  const context = useContext(SignalContext);
  if (!context) throw new Error('useSignals must be used within SignalProvider');
  return context;
}
