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
/** Trading horizon: 'Day Trade' (same-session/intraday, manual-only — the
 *  auto scanner runs on daily bars and never has the resolution to call
 *  one), 'Swing' (short-hold, days/weeks), 'Buy & Hold' (long-term spot
 *  position, no stop), 'LEAPS' (long-dated options, 6mo+). */
export type SignalStyle = 'Day Trade' | 'Swing' | 'Buy & Hold' | 'LEAPS';

export interface Signal {
  id: string;
  asset: string;
  /** GICS-style sector for stocks (e.g. "Technology"), or a short crypto category (e.g. "Smart Contract Platform"). */
  sector?: string;
  market: SignalMarket;
  direction: SignalDirection;
  status: SignalStatus;
  style: SignalStyle;
  entry: string;
  target: string;
  /** Absent for Buy & Hold signals — deliberately no hard stop-loss. */
  stop?: string;
  timeframe: string;
  risk: string;
  analysis: string;
  postedAt: string;
  isOption: boolean;
  optionType?: OptionType;
  contract?: string;
  /** Quantity of `contract` to trade — options/LEAPS only in the UI, always defaults to 1 server-side. */
  contractAmount?: number;
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
  /** Optional chart screenshot data URL to go with "Wick's Read" (`analysis` below). */
  analysisImageDataUrl?: string | null;
  /** 'manual' (admin-authored) or 'auto' (produced by the scheduled signal scanner). */
  source?: string;
  /** "Keep in mind" star: trade window overlaps a major macro event or the symbol's earnings date. */
  newsAlert?: boolean;
  newsAlertNote?: string;
  /** Best-effort logo image URL for `asset`, resolved server-side; null/absent falls back to an initials badge. */
  logoUrl?: string | null;
  /** Admin-curated "featured in Community" flag — shows in the Community tab's Signals feed for every member (capped at 4 at once server-side). Distinct from `newsAlert`. */
  communityStarred?: boolean;
}

interface ApiSignal {
  id: string;
  asset: string;
  sector?: string | null;
  market: string;
  direction: string;
  status: string;
  style?: string;
  entry: string;
  target: string;
  stop?: string | null;
  timeframe: string;
  risk: string;
  analysis: string;
  createdAt: string;
  isOption: boolean;
  optionType?: string;
  contract?: string;
  contractAmount?: number;
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
  analysisImageDataUrl?: string | null;
  source?: string;
  newsAlert?: boolean;
  newsAlertNote?: string;
  logoUrl?: string | null;
  communityStarred?: boolean;
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
    sector: s.sector ?? undefined,
    market: s.market as SignalMarket,
    direction: s.direction as SignalDirection,
    status: s.status as SignalStatus,
    style: (s.style as SignalStyle) ?? 'Swing',
    entry: s.entry,
    target: s.target,
    stop: s.stop ?? undefined,
    timeframe: s.timeframe,
    risk: s.risk,
    analysis: s.analysis,
    postedAt: formatPostedAt(s.createdAt),
    isOption: s.isOption,
    optionType: s.optionType as OptionType | undefined,
    contract: s.contract,
    contractAmount: s.contractAmount,
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
    analysisImageDataUrl: s.analysisImageDataUrl,
    source: s.source,
    newsAlert: s.newsAlert,
    newsAlertNote: s.newsAlertNote,
    logoUrl: s.logoUrl,
    communityStarred: s.communityStarred,
  };
}

/** Fields an admin can send when creating or editing a signal. */
export type SignalInput = Omit<Signal, 'id' | 'postedAt'>;

interface SignalContextValue {
  signals: Signal[];
  isLoading: boolean;
  isSubscriptionRequired: boolean;
  /** True when the member has an active subscription but it's Membership —
   *  Signals is not included on that plan, so the tab should prompt an
   *  upgrade rather than the generic "pick a plan" screen. */
  isSignalsPlanRequired: boolean;
  error: string | null;
  /** The ≤4 admin-curated signals featured in the Community tab (see
   *  communityStarred below). Fetched independently of `signals` above —
   *  it comes from a separate endpoint gated only by an active subscription
   *  of any plan, not requireSignalsPlan, so Membership subscribers (who
   *  are blocked from the full feed) still see this curated reel. */
  communitySignals: Signal[];
  isCommunitySignalsLoading: boolean;
  refresh: () => Promise<void>;
  addSignal: (signal: SignalInput) => Promise<void>;
  /** Admin: PATCH an existing signal (full field set or a partial like status). */
  updateSignal: (id: string, patch: Partial<SignalInput>) => Promise<void>;
  /** Admin: permanently remove a signal (e.g. dismiss an auto-generated one). */
  deleteSignal: (id: string) => Promise<void>;
}

const SignalContext = createContext<SignalContextValue | null>(null);

export function SignalProvider({ children }: { children: ReactNode }) {
  const { getToken, isSignedIn, user } = useAuth();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);
  const [isSignalsPlanRequired, setIsSignalsPlanRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [communitySignals, setCommunitySignals] = useState<Signal[]>([]);
  const [isCommunitySignalsLoading, setIsCommunitySignalsLoading] = useState(true);
  const storageKey = getStorageKey(user?.id);
  const communityStorageKey = storageKey ? `${storageKey}:community-starred` : null;

  const fetchSignals = useCallback(async () => {
    if (!isSignedIn || !storageKey) {
      setSignals([]);
      setError(null);
      setIsSubscriptionRequired(false);
      setIsSignalsPlanRequired(false);
      setIsLoading(false);
      return;
    }

    const token = await getToken();
    if (!token) {
      setSignals([]);
      setError(null);
      setIsSubscriptionRequired(false);
      setIsSignalsPlanRequired(false);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    setIsSubscriptionRequired(false);
    setIsSignalsPlanRequired(false);
    try {
      const res = await fetch(`${API_BASE}/signals`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        const json = (await res.json()) as { code?: string };
        if (json.code === 'SUBSCRIPTION_REQUIRED' || json.code === 'SIGNALS_PLAN_REQUIRED') {
          if (json.code === 'SIGNALS_PLAN_REQUIRED') {
            setIsSignalsPlanRequired(true);
          } else {
            setIsSubscriptionRequired(true);
          }
          setSignals([]);
          // Purge any signals cached from a previous, entitled session. Without
          // this, a lapsed (or Membership-only) subscriber who later hits a
          // transient network error (not another 403) would fall into the
          // offline-cache branch below and see stale paid content despite no
          // longer being entitled to it.
          void AsyncStorage.removeItem(storageKey);
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

  // Separate fetch for the Community tab's curated "starred" reel — hits
  // /signals/community-starred, which is gated by any active subscription
  // (not requireSignalsPlan), so a Membership-only member still gets this
  // even while `fetchSignals` above is 403'ing them off the full feed.
  const fetchCommunitySignals = useCallback(async () => {
    if (!isSignedIn || !communityStorageKey) {
      setCommunitySignals([]);
      setIsCommunitySignalsLoading(false);
      return;
    }
    const token = await getToken();
    if (!token) {
      setCommunitySignals([]);
      setIsCommunitySignalsLoading(false);
      return;
    }
    setIsCommunitySignalsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/signals/community-starred`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        // No active subscription at all — Community itself is gated
        // elsewhere, but fail safe here too rather than surfacing a
        // confusing error inside an already-inaccessible tab.
        setCommunitySignals([]);
        void AsyncStorage.removeItem(communityStorageKey);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { signals: ApiSignal[] };
      const mapped = json.signals.map(mapApiSignal);
      setCommunitySignals(mapped);
      void AsyncStorage.setItem(communityStorageKey, JSON.stringify(mapped));
    } catch {
      try {
        const cached = await AsyncStorage.getItem(communityStorageKey);
        if (cached) {
          const parsed = JSON.parse(cached) as Signal[];
          if (Array.isArray(parsed)) setCommunitySignals(parsed);
        }
      } catch {
        /* ignore */
      }
    } finally {
      setIsCommunitySignalsLoading(false);
    }
  }, [getToken, isSignedIn, communityStorageKey]);

  // Refresh when the authenticated user changes so cached member data never
  // leaks between sessions.
  useEffect(() => {
    void fetchSignals();
  }, [fetchSignals, user?.id]);

  useEffect(() => {
    void fetchCommunitySignals();
  }, [fetchCommunitySignals, user?.id]);

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
    void fetchCommunitySignals();
  }, [getToken, fetchSignals, fetchCommunitySignals]);

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
    void fetchCommunitySignals();
  }, [getToken, fetchSignals, fetchCommunitySignals]);

  const deleteSignal = useCallback(async (id: string) => {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`${API_BASE}/signals/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? 'Failed to delete signal');
    }
    await fetchSignals();
    void fetchCommunitySignals();
  }, [getToken, fetchSignals, fetchCommunitySignals]);

  const value = useMemo(
    () => ({
      signals,
      isLoading,
      isSubscriptionRequired,
      isSignalsPlanRequired,
      error,
      communitySignals,
      isCommunitySignalsLoading,
      refresh: fetchSignals,
      addSignal,
      updateSignal,
      deleteSignal,
    }),
    [
      signals,
      isLoading,
      isSubscriptionRequired,
      isSignalsPlanRequired,
      error,
      communitySignals,
      isCommunitySignalsLoading,
      fetchSignals,
      addSignal,
      updateSignal,
      deleteSignal,
    ],
  );

  return <SignalContext.Provider value={value}>{children}</SignalContext.Provider>;
}

export function useSignals() {
  const context = useContext(SignalContext);
  if (!context) throw new Error('useSignals must be used within SignalProvider');
  return context;
}
