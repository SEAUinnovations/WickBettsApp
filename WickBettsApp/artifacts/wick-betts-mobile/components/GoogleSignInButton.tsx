import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useAuth as useClerkAuth, useSSO } from '@clerk/expo';
import { useColors } from '@/hooks/useColors';
import { API_BASE } from '@/lib/apiUrl';

// Required: complete any pending auth sessions on startup. Safe to call from
// both login.tsx and sign-up.tsx — Clerk's own guard makes repeat calls a
// no-op.
WebBrowser.maybeCompleteAuthSession();

/** Warm up the browser on Android to reduce sign-in load time */
function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => { void WebBrowser.coolDownAsync(); };
  }, []);
}

/**
 * Attributes a referral code to the account immediately after a Google
 * sign-in session goes active. This is the one path the email/password
 * sign-up's Clerk `unsafeMetadata` trick (see app/sign-up.tsx) can't
 * reach: Clerk doesn't know whether an OAuth attempt will create a new
 * account or sign into an existing one until *after* the redirect
 * completes, so there's no point beforehand to stash metadata. Calling
 * POST /api/referrals/attribute here instead is safe to call unconditionally
 * — the backend only accepts it for an account with no referrer yet and no
 * subscription yet, so it can never rewrite an existing member's referral
 * history (see routes/referrals.ts and docs/adr/0010-referral-program.md).
 * Best-effort: a failure here shouldn't block sign-in, and there's nothing
 * actionable to show the user for a background attribution call.
 */
async function attributeReferralCode(token: string, referralCode: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/referrals/attribute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ referralCode }),
    });
  } catch {
    // Non-critical — see doc comment above.
  }
}

/**
 * Shared "Continue with Google" button for both the sign-in screen
 * (app/login.tsx) and the sign-up screen (app/sign-up.tsx). Extracted out
 * of login.tsx so the referral-attribution step only has to be written
 * once rather than duplicated between the two screens.
 */
export function GoogleSignInButton({
  referralCode,
  onError,
}: {
  /** Referral code to attribute if this sign-in creates (or is) a fresh, not-yet-converted account. Omit on the plain sign-in screen — there's nothing to attribute there. */
  referralCode?: string;
  onError?: (message: string) => void;
}) {
  useWarmUpBrowser();
  const { startSSOFlow } = useSSO();
  const { getToken } = useClerkAuth();
  const colors = useColors();
  const [loading, setLoading] = useState(false);

  const handlePress = useCallback(async () => {
    setLoading(true);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
      });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        const trimmedCode = referralCode?.trim();
        if (trimmedCode) {
          const token = await getToken();
          if (token) await attributeReferralCode(token, trimmedCode.toUpperCase());
        }
        // AuthGate in _layout.tsx detects the active session and navigates to /(tabs)
      } else {
        onError?.('Google sign-in did not complete. Please try again.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('popup') || msg.includes('blocked')) {
        onError?.('Popup blocked. Allow popups for wickbetts.com and try again.');
      } else if (msg.includes('network') || msg.includes('fetch')) {
        onError?.('Network error. Check your connection and try again.');
      } else {
        onError?.('Sign in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [startSSOFlow, getToken, referralCode, onError]);

  return (
    <Pressable
      onPress={() => void handlePress()}
      disabled={loading}
      style={({ pressed }) => [
        styles.googleButton,
        { backgroundColor: pressed ? '#1a1a2e' : colors.card, borderColor: colors.border },
        loading && { opacity: 0.6 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <View style={styles.googleIcon}>
          <Text style={styles.googleIconText}>G</Text>
        </View>
      )}
      <Text style={[styles.googleButtonText, { color: colors.foreground }]}>
        {loading ? 'Opening Google…' : 'Continue with Google'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 16,
  },
  googleIcon: {
    width: 20,
    height: 20,
    borderRadius: 2,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIconText: { fontSize: 13, fontWeight: '700', color: '#4285F4', lineHeight: 18 },
  googleButtonText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
