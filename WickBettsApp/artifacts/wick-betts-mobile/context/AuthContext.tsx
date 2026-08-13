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

export type Plan = 'signals' | 'mentorship' | 'membership';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  hasStripeCustomer: boolean;
  notifySignals: boolean;
  notifyNews: boolean;
  timezone?: string | null;
}

export interface AuthSubscription {
  plan: string;
  status: string;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  subscription: AuthSubscription | null;
  isLoading: boolean;
  isSignedIn: boolean;
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
  /** Cancel the active subscription at period end (member keeps access until then). */
  cancelSubscription: () => Promise<void>;
  /** Undo a pending cancel-at-period-end. */
  resumeSubscription: () => Promise<void>;
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

function getEmailPrefix(email: string | null | undefined): string {
  return email?.split('@')[0]?.trim() ?? '';
}

type ClerkUser = ReturnType<typeof useUser>['user'];

function getClerkUsername(clerkUser: ClerkUser): string {
  if (!clerkUser) return '';
  const unsafeMetadata = clerkUser.unsafeMetadata as { username?: unknown } | undefined;
  const username = typeof unsafeMetadata?.username === 'string' ? unsafeMetadata.username.trim() : '';
  return username || clerkUser.fullName || getEmailPrefix(clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses?.[0]?.emailAddress);
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

  const getTokenWithTimeout = useCallback(async (): Promise<string | null> => {
    const timeout = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 8000);
    });
    return await Promise.race([getToken(), timeout]);
  }, [getToken]);

  useEffect(() => {
    if (!isSignedIn) {
      setDbUser(null);
      setSubscription(null);
      return;
    }

    // Clear hydrated backend state when Clerk switches users so stale data from
    // the previous session cannot render while the new profile reloads.
    setDbUser(null);
    setSubscription(null);
  }, [isSignedIn, clerkUser?.id]);

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
        const token = await getTokenWithTimeout();
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
  }, [isLoaded, isSignedIn, getTokenWithTimeout]);

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

  const cancelSubscription = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`${API_BASE}/stripe/cancel-subscription`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? 'Could not cancel your subscription. Please try again.');
    }
    await refreshSubscription();
  }, [getToken, refreshSubscription]);

  const resumeSubscription = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`${API_BASE}/stripe/resume-subscription`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? 'Could not resume your subscription. Please try again.');
    }
    await refreshSubscription();
  }, [getToken, refreshSubscription]);

  // Merge Clerk identity with local DB data for richer display.
  // If the backend profile row is not available yet, keep the signed-in Clerk
  // user visible so the app can render the dashboard instead of staying in a
  // loading loop.
  const user = useMemo<AuthUser | null>(() => {
    const clerkEmail = clerkUser?.primaryEmailAddress?.emailAddress
      ?? clerkUser?.emailAddresses?.[0]?.emailAddress
      ?? '';
    const clerkUsername = getClerkUsername(clerkUser);

    if (!dbUser && !clerkUser) return null;

    if (!dbUser) {
      return {
        id: clerkUser?.id ?? '',
        email: clerkEmail,
        name: clerkUsername || 'Member',
        avatarUrl: clerkUser?.imageUrl ?? null,
        role: 'member',
        hasStripeCustomer: false,
        notifySignals: true,
        notifyNews: false,
      };
    }

    return {
      ...dbUser,
      email: dbUser.email || clerkEmail,
      name: clerkUsername || dbUser.name,
      avatarUrl: clerkUser?.imageUrl ?? dbUser.avatarUrl,
    };
  }, [dbUser, clerkUser]);

  const isLoading = !isLoaded || isLoadingData;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      subscription,
      isLoading,
      isSignedIn: !!isSignedIn,
      signOut,
      getToken,
      updateNotificationPrefs,
      refreshSubscription,
      startCheckout,
      openBillingPortal,
      cancelSubscription,
      resumeSubscription,
    }),
    [
      user,
      subscription,
      isLoading,
      isSignedIn,
      signOut,
      getToken,
      updateNotificationPrefs,
      refreshSubscription,
      startCheckout,
      openBillingPortal,
      cancelSubscription,
      resumeSubscription,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
