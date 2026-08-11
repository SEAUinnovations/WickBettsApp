import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import { useAuth as useClerkAuth, useUser } from '@clerk/expo';
import * as Notifications from 'expo-notifications';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { API_BASE } from '@/lib/apiUrl';

export type Plan = 'signals' | 'mentorship';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  hasStripeCustomer: boolean;
  notifySignals: boolean;
  notifyNews: boolean;
}

export interface AuthSubscription {
  plan: string;
  status: string;
  stripeSubscriptionId: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  subscription: AuthSubscription | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  /** Retrieve a fresh Clerk session JWT for Bearer-authenticated API calls */
  getToken: () => Promise<string | null>;
  /** Optimistically update notification prefs in context after a successful API call */
  updateNotificationPrefs: (prefs: { notifySignals?: boolean; notifyNews?: boolean }) => void;
  /** Re-fetch the subscription from the API and update context (e.g. after checkout) */
  refreshSubscription: () => Promise<void>;
  /**
   * Start a Stripe Checkout for the given plan: opens the hosted checkout page in
   * an in-app browser, then refreshes the subscription once the browser closes.
   */
  startCheckout: (plan: Plan) => Promise<void>;
  /**
   * Open the Stripe billing portal in an in-app browser, then refresh the
   * subscription once the browser closes.
   */
  openBillingPortal: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchMe(token: string): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as AuthUser;
  } catch {
    return null;
  }
}

async function fetchSubscription(token: string): Promise<AuthSubscription | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/subscription`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { subscription: AuthSubscription | null };
    return json.subscription;
  } catch {
    return null;
  }
}

/**
 * Register for Expo push notifications and store the token on the server.
 * Silently no-ops on web, without an EAS project ID, or if permissions are denied.
 */
async function registerPushToken(token: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    type GrantedResult = { granted: boolean };
    const perms = (await Notifications.getPermissionsAsync()) as unknown as GrantedResult;
    if (!perms.granted) {
      const requested = (await Notifications.requestPermissionsAsync()) as unknown as GrantedResult;
      if (!requested.granted) return;
    }
    const projectId =
      (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ??
      (Constants.easConfig?.projectId as string | undefined);
    if (!projectId) return;

    const { data: pushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!pushToken) return;

    await fetch(`${API_BASE}/auth/push-token`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pushToken }),
    });
  } catch {
    // Non-critical — push notifications degrade gracefully
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken: clerkGetToken, signOut: clerkSignOut } = useClerkAuth();
  const { user: clerkUser } = useUser();

  const [dbUser, setDbUser] = useState<AuthUser | null>(null);
  const [subscription, setSubscription] = useState<AuthSubscription | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);

  /** Thin wrapper that catches errors and returns null instead of throwing */
  const getToken = useCallback(async (): Promise<string | null> => {
    try {
      return await clerkGetToken();
    } catch {
      return null;
    }
  }, [clerkGetToken]);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setDbUser(null);
      setSubscription(null);
      return;
    }

    void (async () => {
      setIsLoadingData(true);
      try {
        const token = await getToken();
        if (!token) return;

        const [me, sub] = await Promise.all([
          fetchMe(token),
          fetchSubscription(token),
        ]);

        setDbUser(me);
        setSubscription(sub);

        // Register push token after sign-in (fire-and-forget)
        void registerPushToken(token);
      } finally {
        setIsLoadingData(false);
      }
    })();
  }, [isLoaded, isSignedIn, getToken]);

  const signOut = useCallback(async () => {
    await clerkSignOut();
    setDbUser(null);
    setSubscription(null);
  }, [clerkSignOut]);

  const updateNotificationPrefs = useCallback(
    (prefs: { notifySignals?: boolean; notifyNews?: boolean }) => {
      setDbUser((prev) => (prev ? { ...prev, ...prefs } : prev));
    },
    [],
  );

  /** Re-fetch the subscription and refresh the user (picks up hasStripeCustomer). */
  const refreshSubscription = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const [me, sub] = await Promise.all([fetchMe(token), fetchSubscription(token)]);
    if (me) setDbUser(me);
    setSubscription(sub);
  }, [getToken]);

  const startCheckout = useCallback(
    async (plan: Plan) => {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${API_BASE}/stripe/create-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Could not start checkout. Please try again.');
      }
      const { url } = (await res.json()) as { url: string };
      await WebBrowser.openBrowserAsync(url);
      // Refresh subscription state once the member returns from the browser
      await refreshSubscription();
    },
    [getToken, refreshSubscription],
  );

  const openBillingPortal = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`${API_BASE}/stripe/create-portal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? 'Could not open the billing portal. Please try again.');
    }
    const { url } = (await res.json()) as { url: string };
    await WebBrowser.openBrowserAsync(url);
    await refreshSubscription();
  }, [getToken, refreshSubscription]);

  // Merge Clerk identity with local DB data for richer display
  const user = useMemo<AuthUser | null>(() => {
    if (!dbUser) return null;
    return {
      ...dbUser,
      name: clerkUser?.fullName ?? dbUser.name,
      avatarUrl: clerkUser?.imageUrl ?? dbUser.avatarUrl,
    };
  }, [dbUser, clerkUser]);

  const isLoading = !isLoaded || isLoadingData;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      subscription,
      isLoading,
      signOut,
      getToken,
      updateNotificationPrefs,
      refreshSubscription,
      startCheckout,
      openBillingPortal,
    }),
    [
      user,
      subscription,
      isLoading,
      signOut,
      getToken,
      updateNotificationPrefs,
      refreshSubscription,
      startCheckout,
      openBillingPortal,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
