import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useMarketData } from '@/hooks/useMarketData';
import { useAuth } from '@/context/AuthContext';
import { Card, Header, Metric, PrimaryButton, Screen, SectionLabel, Tag } from '@/components/WickUI';

const HIGHLIGHT_SYMBOLS = ['SPY', 'QQQ', '^VIX', 'BTC-USD'];

function changeColor(pct: number, positive: string, negative: string, neutral: string): string {
  if (pct > 0.15) return positive;
  if (pct < -0.15) return negative;
  return neutral;
}

function formatPrice(price: number, symbol: string): string {
  if (symbol === 'BTC-USD') return `$${Math.round(price).toLocaleString()}`;
  if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `$${price.toFixed(2)}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const { data: market, loading: marketLoading } = useMarketData();
  const { user } = useAuth();

  const pushProtected = (href: '/mentorship' | '/(tabs)/signals') => {
    if (!user) {
      router.push('/login');
      return;
    }
    router.push(href);
  };

  const openMentorship = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    pushProtected('/mentorship');
  };

  const highlights = HIGHLIGHT_SYMBOLS.map((sym) =>
    market?.quotes.find((q) => q.symbol === sym)
  ).filter(Boolean);

  return (
    <Screen contentStyle={styles.content}>
      <Header
        eyebrow={`Wick Betts / ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`}
        title="Good morning."
        action="Alerts"
        onAction={() => {}}
      />

      {/* Status banner */}
      <View style={[styles.statusBanner, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <View style={[styles.liveDot, { backgroundColor: colors.primary }]} />
        <Text style={[styles.statusText, { color: colors.accent }]}>MARKETS • DELAYED 15 MIN</Text>
        <Text style={[styles.statusTime, { color: colors.mutedForeground }]}>Pull to refresh</Text>
      </View>

      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={[styles.heroKicker, { color: colors.primary }]}>THE DAILY BRIEF</Text>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>Read the market{'\n'}before it moves.</Text>
          <Text style={[styles.heroBody, { color: colors.mutedForeground }]}>
            Context first. Conviction second. A focused room for the decisions that deserve more than noise.
          </Text>
        </View>
        <View style={[styles.orbit, { borderColor: colors.primary }]}>
          <View style={[styles.orbitInner, { borderColor: colors.accent }]} />
          <View style={[styles.orbitDot, { backgroundColor: colors.accent }]} />
        </View>
      </View>

      {/* Live Market Snapshot */}
      <SectionLabel>Market snapshot</SectionLabel>
      <Card style={styles.metricsCard}>
        {marketLoading && highlights.length === 0 ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading market data…</Text>
          </View>
        ) : (
          <View style={styles.metricRow}>
            {highlights.map((q) => {
              if (!q) return null;
              const pos = changeColor(q.changePercent, '#7AE2AA', '#E27A7A', colors.mutedForeground);
              const label = q.symbol === '^VIX' ? 'VIX' : q.symbol === 'BTC-USD' ? 'BTC / USD' : q.symbol;
              const detail = `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%`;
              return (
                <Metric
                  key={q.symbol}
                  label={label}
                  value={q.symbol === '^VIX' ? q.price.toFixed(1) : formatPrice(q.price, q.symbol)}
                  detail={detail}
                  color={pos}
                />
              );
            })}
          </View>
        )}
        <View style={[styles.microLine, { backgroundColor: colors.border }]}>
          <Text style={[styles.microText, { color: colors.mutedForeground }]}>
            {market?.fetchedAt
              ? `Updated ${new Date(market.fetchedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} · Data delayed 15 min`
              : '15-min delayed data via Yahoo Finance'}
          </Text>
        </View>
      </Card>

      {/* Market Block Grid */}
      <SectionLabel>Sector heat</SectionLabel>
      <MarketHeatGrid quotes={market?.quotes ?? []} loading={marketLoading} />

      {/* Active signal teaser */}
      <SectionLabel>Active signals</SectionLabel>
      <Card style={styles.signalTeaser} onPress={() => pushProtected('/(tabs)/signals')}>
        <View style={styles.signalTeaserRow}>
          <View style={[styles.signalBadge, { backgroundColor: colors.secondary }]}>
            <Ionicons name="pulse-outline" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.signalTeaserTitle, { color: colors.foreground }]}>View today's signals</Text>
            <Text style={[styles.signalTeaserBody, { color: colors.mutedForeground }]}>
              Stocks, crypto & options with full Greeks
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.mutedForeground} />
        </View>
      </Card>

      {/* Mentorship CTA */}
      <Card style={[styles.mentorCard, { borderColor: colors.primary }]}>
        <Text style={[styles.mentorKicker, { color: colors.primary }]}>YOUR WEEKLY HOUR</Text>
        <Text style={[styles.mentorTitle, { color: colors.foreground }]}>A room is waiting for you.</Text>
        <Text style={[styles.mentorBody, { color: colors.mutedForeground }]}>
          Pressure-test your process with a Wick mentor. One hour, weekly, no noise.
        </Text>
        <PrimaryButton onPress={openMentorship} icon="calendar-outline">Book a session</PrimaryButton>
      </Card>
    </Screen>
  );
}

function MarketHeatGrid({ quotes, loading }: { quotes: ReturnType<typeof useMarketData>['data'] extends null ? [] : NonNullable<ReturnType<typeof useMarketData>['data']>['quotes']; loading: boolean }) {
  const colors = useColors();
  const sectors = quotes.filter((q) => q.group === 'sectors');
  const crypto = quotes.filter((q) => q.group === 'crypto');
  const shown = [...sectors, ...crypto].slice(0, 14);

  if (loading && shown.length === 0) {
    return (
      <View style={[styles.heatPlaceholder, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <ActivityIndicator color={colors.primary} size="small" />
      </View>
    );
  }

  return (
    <View style={styles.heatGrid}>
      {shown.map((q) => {
        const pct = q.changePercent;
        const bg = pct >= 2 ? '#0d3322' : pct >= 0.5 ? '#13281c' : pct >= -0.5 ? '#1a1a2e' : pct >= -2 ? '#2d0f0f' : '#3d0808';
        const textColor = pct >= 0.5 ? '#7AE2AA' : pct >= -0.5 ? colors.mutedForeground : '#E27A7A';
        const label = q.symbol.replace('-USD', '').replace('^', '');
        return (
          <View key={q.symbol} style={[styles.heatCell, { backgroundColor: bg, borderColor: colors.border }]}>
            <Text style={[styles.heatTicker, { color: colors.foreground }]}>{label}</Text>
            <Text style={[styles.heatPct, { color: textColor }]}>
              {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 110 },
  statusBanner: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 22 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { flex: 1, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.2 },
  statusTime: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  hero: { flexDirection: 'row', alignItems: 'center', marginBottom: 28, gap: 14 },
  heroCopy: { flex: 1 },
  heroKicker: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, marginBottom: 8 },
  heroTitle: { fontSize: 26, fontFamily: 'Inter_700Bold', letterSpacing: -0.7, lineHeight: 30, marginBottom: 10 },
  heroBody: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  orbit: { width: 80, height: 80, borderRadius: 40, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  orbitInner: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  orbitDot: { width: 8, height: 8, borderRadius: 4 },
  metricsCard: { marginBottom: 22 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  loadingText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between' },
  microLine: { height: 1, marginTop: 14, marginBottom: 10 },
  microText: { fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 10, textAlign: 'center', letterSpacing: 0.5 },
  heatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 22 },
  heatCell: { width: '22%', flexGrow: 1, borderRadius: 12, borderWidth: 1, padding: 10, alignItems: 'center', minHeight: 60, justifyContent: 'center' },
  heatTicker: { fontSize: 10, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  heatPct: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  heatPlaceholder: { height: 80, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  signalTeaser: { marginBottom: 14 },
  signalTeaserRow: { flexDirection: 'row', alignItems: 'center' },
  signalBadge: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  signalTeaserTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  signalTeaserBody: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  mentorCard: { borderWidth: 1.5, marginBottom: 10 },
  mentorKicker: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, marginBottom: 8 },
  mentorTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', letterSpacing: -0.5, marginBottom: 7 },
  mentorBody: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17, marginBottom: 16 },
});
