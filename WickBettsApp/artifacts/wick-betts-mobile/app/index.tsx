import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth, type Plan } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

const WB_LOGO = require('@/assets/images/wb-logo.png') as number;

// High-level plan comparison for the pricing table below — each tier is a
// superset of the one before it (Membership is the community/education
// foundation every plan includes; Signals layers on the live trade desk;
// Mentorship adds direct 1-on-1 time). Kept intentionally simple/checkmark
// style per the "very high level" brief — the full fine print lives on the
// Legal screen, not here.
const PLAN_COLUMNS: { plan: Plan; label: string; price: string }[] = [
  { plan: 'membership', label: 'Membership', price: '$50/mo' },
  { plan: 'signals', label: 'Signals', price: '$200/mo' },
  { plan: 'mentorship', label: 'Mentorship', price: '$500/mo' },
];

const COMPARE_ROWS: { feature: string; included: [boolean, boolean, boolean] }[] = [
  { feature: 'Community access', included: [true, true, true] },
  { feature: 'Full Learning Academy', included: [true, true, true] },
  { feature: 'Trade review credits', included: [true, true, true] },
  { feature: 'Live trading signals', included: [false, true, true] },
  { feature: 'Newsroom & market feed', included: [false, true, true] },
  { feature: 'Real-time market quotes', included: [false, true, true] },
  { feature: 'Weekly 1-on-1 mentor session', included: [false, false, true] },
];

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

        {/* ── Pricing compare ── */}
        <View style={styles.compareSection}>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>Find your fit</Text>
          <Text style={[styles.compareHeadline, { color: colors.foreground }]}>Three ways in — compare what you get.</Text>
          <View style={[styles.compareTable, { borderColor: colors.border }]}>
            <View style={styles.compareHeaderRow}>
              <View style={styles.compareFeatureCol} />
              {PLAN_COLUMNS.map((col) => (
                <View key={col.plan} style={styles.comparePlanCol}>
                  <Text style={[styles.comparePlanLabel, { color: colors.foreground }]}>{col.label}</Text>
                  <Text style={styles.comparePlanPrice}>{col.price}</Text>
                </View>
              ))}
            </View>
            {COMPARE_ROWS.map((row, i) => (
              <View
                key={row.feature}
                style={[
                  styles.compareRow,
                  { borderTopColor: colors.border },
                  i % 2 === 1 && styles.compareRowAlt,
                ]}
              >
                <View style={styles.compareFeatureCol}>
                  <Text style={[styles.compareFeatureText, { color: colors.mutedForeground }]}>{row.feature}</Text>
                </View>
                {row.included.map((yes, j) => (
                  <View key={j} style={styles.comparePlanCol}>
                    <Ionicons
                      name={yes ? 'checkmark-circle' : 'remove-circle-outline'}
                      size={18}
                      color={yes ? '#7AE2AA' : '#4A4658'}
                    />
                  </View>
                ))}
              </View>
            ))}
            <View style={styles.compareRow}>
              <View style={styles.compareFeatureCol} />
              {PLAN_COLUMNS.map((col) => (
                <View key={col.plan} style={styles.comparePlanCol}>
                  <Pressable
                    onPress={() => void handlePlan(col.plan)}
                    disabled={checkoutLoading !== null || isLoading}
                    style={({ pressed }) => [
                      styles.compareChooseButton,
                      { borderColor: colors.border, backgroundColor: pressed ? '#1a1730' : 'transparent' },
                    ]}
                  >
                    {checkoutLoading === col.plan
                      ? <ActivityIndicator size="small" color="#7C3AED" />
                      : <Text style={styles.compareChooseText}>Choose</Text>}
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
          <Text style={[styles.compareFootnote, { color: colors.mutedForeground }]}>
            Every tier builds on the one before it. All sales are final — see Legal for the full billing policy.
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

  // pricing compare
  compareSection: {
    paddingVertical: 40,
    borderTopWidth: 1,
    borderTopColor: '#1f1d2e',
  },
  compareHeadline: { fontSize: 26, lineHeight: 32, fontFamily: 'Inter_700Bold', marginBottom: 20 },
  compareTable: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  compareHeaderRow: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 10 },
  compareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 10, borderTopWidth: 1 },
  compareRowAlt: { backgroundColor: 'rgba(124,58,237,0.05)' },
  compareFeatureCol: { flex: 1.5, paddingRight: 6 },
  comparePlanCol: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  comparePlanLabel: { fontSize: 12, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  comparePlanPrice: { fontSize: 11, fontFamily: 'Inter_500Medium', color: '#A78BFA', textAlign: 'center', marginTop: 2 },
  compareFeatureText: { fontSize: 11, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  compareChooseButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, minWidth: 64, alignItems: 'center' },
  compareChooseText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#ffffff' },
  compareFootnote: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 14 },
});
