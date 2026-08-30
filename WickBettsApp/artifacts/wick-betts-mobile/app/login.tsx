import React, { useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';

// Required: complete any pending auth sessions on startup
WebBrowser.maybeCompleteAuthSession();

const WB_LOGO = require('@/assets/images/wb-logo.png') as number;

export default function LoginScreen() {
  const router = useRouter();
  const colors = useColors();
  const [error, setError] = useState('');

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

        {/* Google sign-in button — plain sign-in, no referral code to attribute here (that only applies coming from a referral link, which routes through sign-up). */}
        <GoogleSignInButton onError={setError} />

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
  errorText: { fontSize: 12, textAlign: 'center', marginTop: 12, marginBottom: 4 },
  signUpRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 20, marginTop: 20 },
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
