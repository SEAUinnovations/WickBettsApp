import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth as useClerkAuth, useUser } from '@clerk/react';
import { apiPath } from '../lib/api';

export type UserRole = 'member' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  hasStripeCustomer: boolean;
  notifySignals?: boolean;
  notifyNews?: boolean;
}

export interface Subscription {
  id?: string;
  plan: 'signals' | 'mentorship' | 'membership';
  status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete';
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: string;
  stripeSubscriptionId?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  subscription: Subscription | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Get a fresh Clerk JWT for use in Authorization: Bearer headers */
  getToken: () => Promise<string | null>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  startCheckout: (plan: 'signals' | 'mentorship' | 'membership') => Promise<void>;
  openBillingPortal: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Returns headers with Authorization: Bearer when a token is available */
async function authHeaders(
  getToken: () => Promise<string | null>,
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const token = await getToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra ?? {}),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, signOut: clerkSignOut, getToken: clerkGetToken } = useClerkAuth();
  const { user: clerkUser } = useUser();

  const [dbUser, setDbUser] = useState<AuthUser | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);

  /** Thin wrapper — returns null rather than throwing on expired/missing session */
  const getToken = useCallback(async (): Promise<string | null> => {
    try {
      return await clerkGetToken();
    } catch {
      return null;
    }
  }, [clerkGetToken]);

  const fetchUserData = useCallback(async () => {
    if (!isSignedIn) {
      setDbUser(null);
      setSubscription(null);
      return;
    }
    setIsLoadingData(true);
    try {
      const headers = await authHeaders(getToken);
      // Fetch user identity and subscription in parallel
      const [meRes, subRes] = await Promise.all([
        fetch(apiPath('/auth/me'), { headers }),
        fetch(apiPath('/stripe/subscription'), { headers }),
      ]);
      if (meRes.ok) {
        setDbUser((await meRes.json()) as AuthUser);
      } else {
        setDbUser(null);
      }
      if (subRes.ok) {
        const subData = (await subRes.json()) as { subscription: Subscription | null };
        setSubscription(subData.subscription);
      }
      // If subscription fetch fails (non-OK or network error), leave the existing
      // subscription state intact so a transient server hiccup doesn't kick the
      // member out — the AuthGate's grace-period logic handles genuinely lapsed subs.
    } catch {
      setDbUser(null);
      setSubscription(null);
    } finally {
      setIsLoadingData(false);
    }
  }, [isSignedIn, getToken]);

  useEffect(() => {
    if (!isLoaded) return;
    void fetchUserData();
  }, [isLoaded, isSignedIn, fetchUserData]);

  const refresh = useCallback(async () => {
    if (!isLoaded) return;
    await fetchUserData();
  }, [isLoaded, fetchUserData]);

  const logout = useCallback(async () => {
    await clerkSignOut();
    setDbUser(null);
    setSubscription(null);
  }, [clerkSignOut]);

  const startCheckout = useCallback(async (plan: 'signals' | 'mentorship' | 'membership') => {
    const headers = await authHeaders(getToken, { 'Content-Type': 'application/json' });
    const r = await fetch(apiPath('/stripe/create-checkout'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ plan }),
    });
    if (!r.ok) {
      const err = (await r.json()) as { error: string };
      throw new Error(err.error);
    }
    const { url } = (await r.json()) as { url: string };
    window.location.href = url;
  }, [getToken]);

  const openBillingPortal = useCallback(async () => {
    const headers = await authHeaders(getToken);
    const r = await fetch(apiPath('/stripe/create-portal'), {
      method: 'POST',
      headers,
    });
    if (!r.ok) {
      const err = (await r.json()) as { error: string };
      throw new Error(err.error);
    }
    const { url } = (await r.json()) as { url: string };
    window.location.href = url;
  }, [getToken]);

  // Merge Clerk identity with local DB data — prefer Clerk for live display fields
  const user = useMemo<AuthUser | null>(() => {
    if (!dbUser) return null;
    return {
      ...dbUser,
      name: clerkUser?.fullName ?? dbUser.name,
      avatarUrl: clerkUser?.imageUrl ?? dbUser.avatarUrl,
    };
  }, [dbUser, clerkUser]);

  const isLoading = !isLoaded || isLoadingData;

  const value = useMemo<AuthState>(
    () => ({
      user,
      subscription,
      isLoading,
      isAuthenticated: !!user,
      getToken,
      refresh,
      logout,
      startCheckout,
      openBillingPortal,
    }),
    [getToken, logout, openBillingPortal, isLoading, refresh, startCheckout, subscription, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
