import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { useSSO } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';

// Required: complete any pending auth sessions on startup
WebBrowser.maybeCompleteAuthSession();

const WB_LOGO = require('@/assets/images/wb-logo.png') as number;

/** Warm up the browser on Android to reduce sign-in load time */
function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => { void WebBrowser.coolDownAsync(); };
  }, []);
}

export default function LoginScreen() {
  useWarmUpBrowser();
  const { startSSOFlow } = useSSO();
  const router = useRouter();
  const colors = useColors();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
      });

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        // AuthGate in _layout.tsx detects the active session and navigates to /(tabs)
      } else {
        setError('Google sign-in did not complete. Please try again.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Surface actionable errors; hide raw Clerk internals
      if (msg.includes('popup') || msg.includes('blocked')) {
        setError('Popup blocked. Allow popups for wickbetts.com and try again.');
      } else if (msg.includes('network') || msg.includes('fetch')) {
        setError('Network error. Check your connection and try again.');
      } else {
        setError('Sign in failed. Please try again.');
      }
      console.error('SSO error:', err);
    } finally {
      setLoading(false);
    }
  }, [startSSOFlow]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Ambient gradient */}
      <LinearGradient
        colors={['#1a0a2e', '#08070D']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
      />

      <View style={styles.content}>
        {/* Brand mark */}
        <View style={styles.brandRow}>
          <Image source={WB_LOGO} style={styles.logo} resizeMode="contain" />
          <View>
            <Text style={[styles.brandName, { color: colors.foreground }]}>WICK BETTS</Text>
            <Text style={[styles.brandSub, { color: colors.mutedForeground }]}>PRIVATE MARKET INTELLIGENCE</Text>
          </View>
        </View>

        {/* Hero copy */}
        <View style={styles.hero}>
          <Text style={[styles.headline, { color: colors.foreground }]}>
            Read the setup.{'\n'}Not just the call.
          </Text>
          <Text style={[styles.subline, { color: colors.mutedForeground }]}>
            Real-time signals, options Greeks, and market intelligence — reserved for members.
          </Text>
        </View>

        {/* Google sign-in button */}
        <Pressable
          onPress={() => void handleGoogleSignIn()}
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

        {error ? (
          <Text style={[styles.errorText, { color: '#ef4444' }]}>{error}</Text>
        ) : null}

        {/* Sign up link */}
        <View style={styles.signUpRow}>
          <Text style={[styles.signUpText, { color: colors.mutedForeground }]}>New here? </Text>
          <Pressable onPress={() => router.push('/sign-up' as never)}>
            <Text style={[styles.signUpLink, { color: '#a78bfa' }]}>Create an account</Text>
          </Pressable>
        </View>

        <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
          Sign in to access signals, news, and market intelligence.
        </Text>
      </View>

      <Text style={[styles.footer, { color: colors.mutedForeground }]}>
        WICK BETTS · PRIVATE MARKET INTELLIGENCE
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 80,
    justifyContent: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 56,
  },
  logo: { width: 72, height: 72 },
  brandName: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 2,
  },
  brandSub: {
    fontSize: 9,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.5,
    marginTop: 3,
  },
  hero: { marginBottom: 48 },
  headline: {
    fontSize: 36,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -1,
    lineHeight: 42,
    marginBottom: 16,
  },
  subline: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 22,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 16,
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
  errorText: { fontSize: 12, textAlign: 'center', marginBottom: 12 },
  signUpRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 20, marginTop: 4 },
  signUpText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  signUpLink: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  disclaimer: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 12,
  },
  footer: {
    textAlign: 'center',
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.5,
    paddingBottom: 32,
  },
});
