import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

const WB_LOGO = require('@/assets/images/wb-logo.png') as number;

export default function LandingScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user, isLoading } = useAuth();

  const goToMainApp = () => {
    router.push(user ? '/(tabs)' : '/login');
  };

  const goToSignIn = () => {
    // Keep /sign-in as canonical web path; file alias renders Clerk-backed LoginScreen.
    router.push('/sign-in' as never);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}> 
      <LinearGradient
        colors={['#1a0a2e', '#08070D']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.7 }}
      />

      <View style={styles.content}>
        <View style={styles.topRow}>
          <Pressable
            onPress={goToSignIn}
            disabled={isLoading || !!user}
            style={({ pressed }) => [
              styles.topSignInButton,
              { borderColor: colors.border, backgroundColor: pressed ? '#171528' : '#0f0d18' },
              (isLoading || !!user) && { opacity: 0.45 },
            ]}
          >
            <Text style={[styles.topSignInText, { color: colors.foreground }]}>{user ? 'Signed in' : 'Sign in'}</Text>
          </Pressable>
        </View>

        <View style={styles.brandRow}>
          <Image source={WB_LOGO} style={styles.logo} resizeMode="contain" />
          <View>
            <Text style={[styles.brandName, { color: colors.foreground }]}>WICK BETTS</Text>
            <Text style={[styles.brandSub, { color: colors.mutedForeground }]}>PRIVATE MARKET INTELLIGENCE</Text>
          </View>
        </View>

        <Text style={[styles.headline, { color: colors.foreground }]}>The briefing room before the open.</Text>
        <Text style={[styles.subline, { color: colors.mutedForeground }]}>Signals, news, community, mentorship, and account management are now unified under one frontend.</Text>

        <Pressable
          onPress={goToMainApp}
          disabled={isLoading}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: pressed ? '#6127a4' : '#7C3AED' },
            isLoading && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.primaryButtonText}>{user ? 'Enter App' : 'Sign in'}</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/auth')}
          style={({ pressed }) => [
            styles.secondaryButton,
            { borderColor: colors.border, backgroundColor: pressed ? '#121021' : '#0b0a12' },
          ]}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>Sign up</Text>
        </Pressable>

        <Pressable
          onPress={goToMainApp}
          style={({ pressed }) => [
            styles.tertiaryButton,
            { backgroundColor: pressed ? '#121021' : 'transparent' },
          ]}
        >
          <Text style={[styles.tertiaryButtonText, { color: colors.mutedForeground }]}>Continue to app</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingTop: 20,
  },
  topRow: {
    position: 'absolute',
    top: 20,
    left: 28,
    right: 28,
    alignItems: 'flex-end',
  },
  topSignInButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  topSignInText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.2,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 40,
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
  headline: {
    fontSize: 34,
    lineHeight: 40,
    fontFamily: 'Inter_700Bold',
    marginBottom: 14,
  },
  subline: {
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'Inter_400Regular',
    marginBottom: 28,
  },
  primaryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  tertiaryButton: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  tertiaryButtonText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
});
