import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth, type Plan } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

const WB_LOGO = require('@/assets/images/wb-logo.png') as number;

export default function LandingScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user, isLoading, subscription, startCheckout } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = useState<Plan | null>(null);
  const [checkoutError, setCheckoutError] = useState('');

  const handlePlan = async (plan: Plan) => {
    if (!user) {
      router.push('/sign-in' as never);
      return;
    }
    if (subscription?.status === 'active') {
      router.replace('/(tabs)');
      return;
    }
    setCheckoutError('');
    setCheckoutLoading(plan);
    try {
      await startCheckout(plan);
    } catch (err) {
      setCheckoutError((err as Error).message ?? 'Something went wrong.');
    } finally {
      setCheckoutLoading(null);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1a0a2e', '#08070D']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.7 }}
      />

      {/* ── Top nav bar ── */}
      <View style={styles.navbar}>
        <View style={styles.brand}>
          <Image source={WB_LOGO} style={styles.brandLogo} resizeMode="contain" />
          <Text style={[styles.brandName, { color: colors.foreground }]}>Wick Betts</Text>
        </View>

        {isLoading ? (
          <ActivityIndicator size="small" color="#7C3AED" />
        ) : user ? (
          <Pressable
            onPress={() => router.replace('/(tabs)')}
            style={({ pressed }) => [styles.navButton, styles.navButtonDark, { opacity: pressed ? 0.75 : 1 }]}
          >
            <Text style={styles.navButtonDarkText}>Enter desk →</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.push('/sign-in' as never)}
            style={({ pressed }) => [styles.navButton, styles.navButtonOutline, { borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
          >
            <Text style={[styles.navButtonOutlineText, { color: colors.foreground }]}>Sign in</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Hero ── */}
        <View style={styles.heroSection}>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>The Wick Betts membership</Text>
          <Text style={[styles.heroHeadline, { color: colors.foreground }]}>
            {'A clearer room\nbefore the '}
            <Text style={styles.italic}>open.</Text>
          </Text>
          <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
            Daily signals, market context, and an unhurried place to think. Built for people who take stocks, crypto, and options seriously.
          </Text>

          <View style={styles.heroActions}>
            <Pressable
              onPress={() => void handlePlan('signals')}
              disabled={checkoutLoading !== null || isLoading}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: pressed ? '#6127a4' : '#7C3AED' },
                (checkoutLoading !== null || isLoading) && { opacity: 0.6 },
              ]}
            >
              {checkoutLoading === 'signals'
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.primaryButtonText}>Enter with signals →</Text>}
            </Pressable>

            <Pressable
              onPress={() => void handlePlan('mentorship')}
              disabled={checkoutLoading !== null || isLoading}
              style={({ pressed }) => [
                styles.quietButton,
                { borderColor: colors.border, backgroundColor: pressed ? '#171528' : '#0f0d18' },
                (checkoutLoading !== null || isLoading) && { opacity: 0.6 },
              ]}
            >
              {checkoutLoading === 'mentorship'
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={[styles.quietButtonText, { color: colors.foreground }]}>Explore mentorship</Text>}
            </Pressable>

            <Pressable
              onPress={() => void handlePlan('membership')}
              disabled={checkoutLoading !== null || isLoading}
              style={({ pressed }) => [
                styles.quietButton,
                { borderColor: colors.border, backgroundColor: pressed ? '#171528' : '#0f0d18' },
                (checkoutLoading !== null || isLoading) && { opacity: 0.6 },
              ]}
            >
              {checkoutLoading === 'membership'
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={[styles.quietButtonText, { color: colors.foreground }]}>Unlock membership</Text>}
            </Pressable>

            {checkoutError ? <Text style={styles.errorText}>{checkoutError}</Text> : null}
          </View>
        </View>

        {/* ── Intro ── */}
        <View style={styles.introSection}>
          <Text style={[styles.introHeadline, { color: colors.foreground }]}>
            {'Less noise.\n'}<Text style={styles.italic}>Better questions.</Text>
          </Text>
          <Text style={[styles.introCopy, { color: colors.mutedForeground }]}>
            Wick Betts is a private briefing room for the moments when headlines get loud and the useful signal gets quiet. We publish levels, not predictions; context, not certainty.
          </Text>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground, marginTop: 16 }]}>
            A considered view of the tape
          </Text>
        </View>

        {/* ── Feature pills ── */}
        <View style={styles.featureRow}>
          {['Signals', 'Newsroom', 'Community', 'Mentorship'].map((f) => (
            <View key={f} style={[styles.featurePill, { borderColor: colors.border, backgroundColor: '#0f0d18' }]}>
              <Text style={[styles.featurePillText, { color: colors.mutedForeground }]}>{f}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // nav
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 16,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandLogo: { width: 32, height: 32 },
  brandName: { fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: 0.3 },
  navButton: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  navButtonOutline: { borderWidth: 1 },
  navButtonOutlineText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  navButtonDark: { backgroundColor: '#1a1730' },
  navButtonDarkText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#ffffff' },

  // scroll
  scrollContent: { paddingHorizontal: 24 },

  // hero
  heroSection: { paddingTop: 32, paddingBottom: 40 },
  eyebrow: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  heroHeadline: {
    fontSize: 36,
    lineHeight: 44,
    fontFamily: 'Inter_700Bold',
    marginBottom: 16,
  },
  italic: { fontStyle: 'italic' },
  heroSub: {
    fontSize: 15,
    lineHeight: 24,
    fontFamily: 'Inter_400Regular',
    marginBottom: 32,
  },
  heroActions: { gap: 12 },
  primaryButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontFamily: 'Inter_700Bold' },
  quietButton: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    minHeight: 52,
  },
  quietButtonText: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  errorText: { color: '#ef4444', fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 4 },

  // intro
  introSection: {
    paddingVertical: 40,
    borderTopWidth: 1,
    borderTopColor: '#1f1d2e',
  },
  introHeadline: {
    fontSize: 30,
    lineHeight: 38,
    fontFamily: 'Inter_700Bold',
    marginBottom: 16,
  },
  introCopy: { fontSize: 15, lineHeight: 24, fontFamily: 'Inter_400Regular' },

  // pills
  featureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 24 },
  featurePill: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1 },
  featurePillText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
});
