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

const devAuthMode = (import.meta.env.VITE_DEV_AUTH_MODE as string | undefined)?.trim().toLowerCase();
const isDevAuthMode = devAuthMode === 'localhost' || devAuthMode === 'dev';
const devAuthEmail = (import.meta.env.VITE_DEV_AUTH_EMAIL as string | undefined)?.trim() || 'dev@wickbetts.local';
const devAuthName = (import.meta.env.VITE_DEV_AUTH_NAME as string | undefined)?.trim() || 'Dev User';
const devAuthRole = (import.meta.env.VITE_DEV_AUTH_ROLE as string | undefined)?.trim().toLowerCase() === 'admin' ? 'admin' : 'member';

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
  /**
   * Upload a new profile picture. `fileDataUri` is a base64 data URI read
   * from a <input type="file">. Uploads to Clerk first (the canonical image
   * host), then mirrors the resulting URL onto the local user row so other
   * members see it too (community chat, admin roster).
   */
  uploadProfileImage: (fileDataUri: string) => Promise<void>;
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
  if (isDevAuthMode) {
    return <DevAuthProvider>{children}</DevAuthProvider>;
  }

  return <ClerkAuthProvider>{children}</ClerkAuthProvider>;
}

function ClerkAuthProvider({ children }: { children: ReactNode }) {
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

  const uploadProfileImage = useCallback(async (fileDataUri: string) => {
    if (!clerkUser) throw new Error('Not signed in');
    await clerkUser.setProfileImage({ file: fileDataUri });
    await clerkUser.reload();
    const newUrl = clerkUser.imageUrl;
    if (newUrl) {
      setDbUser((prev) => (prev ? { ...prev, avatarUrl: newUrl } : prev));
      try {
        const headers = await authHeaders(getToken, { 'Content-Type': 'application/json' });
        await fetch(apiPath('/auth/profile'), {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ avatarUrl: newUrl }),
        });
      } catch {
        // Non-critical — the user's own view already updated via Clerk;
        // other members just see the old avatar until the next sync.
      }
    }
  }, [clerkUser, getToken]);

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
      uploadProfileImage,
    }),
    [getToken, logout, openBillingPortal, isLoading, refresh, startCheckout, subscription, user, uploadProfileImage],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function DevAuthProvider({ children }: { children: ReactNode }) {
  const [dbUser, setDbUser] = useState<AuthUser | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);

  const getToken = useCallback(async (): Promise<string | null> => null, []);

  const fetchUserData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [meRes, subRes] = await Promise.all([
        fetch(apiPath('/auth/me')),
        fetch(apiPath('/stripe/subscription')),
      ]);
      if (meRes.ok) {
        setDbUser((await meRes.json()) as AuthUser);
      } else {
        setDbUser({
          id: 'dev-user',
          email: devAuthEmail,
          name: devAuthName,
          avatarUrl: null,
          role: devAuthRole,
          hasStripeCustomer: false,
          notifySignals: true,
          notifyNews: false,
        });
      }
      if (subRes.ok) {
        const subData = (await subRes.json()) as { subscription: Subscription | null };
        setSubscription(subData.subscription);
      }
    } catch {
      setDbUser({
        id: 'dev-user',
        email: devAuthEmail,
        name: devAuthName,
        avatarUrl: null,
        role: devAuthRole,
        hasStripeCustomer: false,
        notifySignals: true,
        notifyNews: false,
      });
      setSubscription(null);
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    void fetchUserData();
  }, [fetchUserData]);

  const refresh = useCallback(async () => {
    await fetchUserData();
  }, [fetchUserData]);

  const logout = useCallback(async () => {
    setDbUser(null);
    setSubscription(null);
  }, []);

  const startCheckout = useCallback(async (plan: 'signals' | 'mentorship' | 'membership') => {
    const r = await fetch(apiPath('/stripe/create-checkout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    if (!r.ok) {
      const err = (await r.json()) as { error: string };
      throw new Error(err.error);
    }
    const { url } = (await r.json()) as { url: string };
    window.location.href = url;
  }, []);

  const openBillingPortal = useCallback(async () => {
    const r = await fetch(apiPath('/stripe/create-portal'), { method: 'POST' });
    if (!r.ok) {
      const err = (await r.json()) as { error: string };
      throw new Error(err.error);
    }
    const { url } = (await r.json()) as { url: string };
    window.location.href = url;
  }, []);

  // No real Clerk user object exists in the dev-auth bypass, so there's
  // nowhere to host an uploaded image. Fail with a clear message rather
  // than silently no-op-ing.
  const uploadProfileImage = useCallback(async () => {
    throw new Error('Profile photo upload is not available in local dev-auth mode.');
  }, []);

  const user = useMemo<AuthUser | null>(() => dbUser, [dbUser]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      subscription,
      isLoading: isLoadingData,
      isAuthenticated: !!user,
      getToken,
      refresh,
      logout,
      startCheckout,
      openBillingPortal,
      uploadProfileImage,
    }),
    [getToken, logout, openBillingPortal, isLoadingData, refresh, startCheckout, subscription, user, uploadProfileImage],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
