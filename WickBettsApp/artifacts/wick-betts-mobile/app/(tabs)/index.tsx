import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useMarketData, type QuoteItem } from '@/hooks/useMarketData';
import { useAuth } from '@/context/AuthContext';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useNotifications } from '@/context/NotificationsContext';
import { Card, Header, Metric, PrimaryButton, Screen, SectionLabel, Tag } from '@/components/WickUI';
import { TickerAutocomplete } from '@/components/TickerAutocomplete';
import { SubscribePanel } from '@/components/Billing';

function changeColor(pct: number, positive: string, negative: string, neutral: string): string {
  if (pct > 0) return positive;
  if (pct < 0) return negative;
  return neutral;
}

function formatPrice(price: number, symbol: string): string {
  if (symbol === 'BTC-USD') return `$${Math.round(price).toLocaleString()}`;
  // VIX and the 10Y Treasury are index/yield levels, not dollar prices —
  // showing them with a $ sign would be misleading. Nasdaq's TNX index is
  // quoted as yield*10, so divide back down to a real percent.
  if (symbol === 'VIX') return price.toFixed(2);
  if (symbol === 'TNX') return `${(price / 10).toFixed(2)}%`;
  if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `$${price.toFixed(2)}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const { unreadCount } = useNotifications();
  const { data: market, loading: marketLoading } = useMarketData();
  const { user, subscription } = useAuth();
  const { items: watchlistItems, loading: watchlistLoading, saving: watchlistSaving, error: watchlistError, addItem, removeItem } = useWatchlist();
  const [symbolInput, setSymbolInput] = React.useState('');
  const [noteInput, setNoteInput] = React.useState('');
  const [targetInput, setTargetInput] = React.useState('');
  const username = user?.name ?? 'Member';
  const isAdmin = user?.role === 'admin';

  // The dashboard surfaces paid content (market data, signal teaser) — members
  // with no subscription at all only get Community and Profile for free;
  // everything else, including Home, shows an upsell instead of real data.
  if (subscription === null && !isAdmin) {
    return (
      <Screen contentStyle={styles.content}>
        <Header eyebrow="Wick Betts / Welcome" title={`Hi, ${username}.`} />
        <View style={[styles.statusBanner, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.primary} />
          <Text style={[styles.statusText, { color: colors.accent }]}>YOUR DESK IS ONE STEP AWAY</Text>
        </View>
        <Text style={[styles.heroBody, { color: colors.mutedForeground, marginBottom: 20 }]}>
          Subscribe to a plan to unlock the morning brief, live signals, and market data. Every plan also includes community access, the full Learning tab, and trade reviews — you can still catch up in Community while you decide.
        </Text>
        <SubscribePanel />
      </Screen>
    );
  }

  const pushProtected = (href: '/mentorship' | '/(tabs)/signals' | '/learning') => {
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

  const openLearning = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    pushProtected('/learning');
  };

  const trackedSymbols = [
    ...new Set([
      ...(market?.quotes.filter((q) => q.group === 'indices').map((q) => q.symbol) ?? []),
      ...watchlistItems.map((item) => item.symbol),
    ]),
  ];

  const highlights = trackedSymbols
    .map((sym) => market?.quotes.find((q) => q.symbol === sym))
    .filter(Boolean)
    .slice(0, 10);

  const watchlistQuotes = watchlistItems.map((item) => ({
    item,
    quote: market?.quotes.find((quote) => quote.symbol === item.symbol) ?? null,
  }));

  const handleAddWatchlistItem = async () => {
    const symbol = symbolInput.trim().toUpperCase();
    if (!symbol) return;
    const added = await addItem({ symbol, note: noteInput.trim(), targetPrice: targetInput.trim() });
    if (!added) return;
    setSymbolInput('');
    setNoteInput('');
    setTargetInput('');
  };

  return (
    <Screen contentStyle={styles.content}>
      <Header
        eyebrow={`Wick Betts / ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`}
        title="Good morning."
        action="Alerts"
        onAction={() => router.push('/notifications')}
        badge={unreadCount}
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
          <Text style={[styles.heroWelcome, { color: colors.foreground }]}>Welcome back, {username}.</Text>
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
      <SectionLabel>Tracked board</SectionLabel>
      <Card style={styles.metricsCard}>
        {marketLoading && highlights.length === 0 ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading market data…</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricScroll}>
            {highlights.map((q) => {
              if (!q) return null;
              const pos = changeColor(q.changePercent, '#7AE2AA', '#E27A7A', colors.mutedForeground);
              const label = q.symbol === 'BTC-USD' ? 'BTC / USD' : q.symbol;
              const detail = `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%`;
              return (
                <View key={q.symbol} style={styles.metricCardWrap}>
                  <Metric
                    label={label}
                    value={formatPrice(q.price, q.symbol)}
                    detail={detail}
                    color={pos}
                  />
                </View>
              );
            })}
          </ScrollView>
        )}
        <View style={[styles.microLine, { backgroundColor: colors.border }]}>
          <Text style={[styles.microText, { color: colors.mutedForeground }]}>
            {market?.fetchedAt
              ? `Updated ${new Date(market.fetchedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} · index ETFs plus your saved symbols`
              : 'Index ETFs plus your saved symbols via delayed market data'}
          </Text>
        </View>
      </Card>

      {/* Market Block Grid */}
      <SectionLabel>Sector heat</SectionLabel>
      <SectorHeatmap quotes={market?.quotes ?? []} loading={marketLoading} />

      {isAdmin ? (
        <>
          <SectionLabel>Admin quick actions</SectionLabel>
          <Card style={styles.adminCard}>
            <Text style={[styles.watchlistIntro, { color: colors.mutedForeground }]}>Jump into the signal studio or user management without leaving the live member experience.</Text>
            <View style={styles.adminActions}>
              <PrimaryButton onPress={() => router.push('/admin')} icon="create-outline">Open signal studio</PrimaryButton>
              <PrimaryButton onPress={() => router.push('/admin/users')} icon="people-outline">Manage users</PrimaryButton>
            </View>
          </Card>
        </>
      ) : null}

      <SectionLabel>Watchlist</SectionLabel>
      <Card style={styles.watchlistCard}>
        <Text style={[styles.watchlistIntro, { color: colors.mutedForeground }]}>Track supported symbols from the live market universe and keep quick notes or targets beside them.</Text>
        <View style={styles.watchlistForm}>
          <TickerAutocomplete
            value={symbolInput}
            onChangeText={setSymbolInput}
            placeholder="Ticker"
            testID="watchlist-ticker-input"
          />
          <TextInput
            style={[styles.watchlistInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
            value={noteInput}
            onChangeText={setNoteInput}
            placeholder="Note (optional)"
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            style={[styles.watchlistInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
            value={targetInput}
            onChangeText={setTargetInput}
            placeholder="Target (optional)"
            placeholderTextColor={colors.mutedForeground}
          />
          <PrimaryButton onPress={() => void handleAddWatchlistItem()} icon="add-outline">
            {watchlistSaving ? 'Saving…' : 'Add to watchlist'}
          </PrimaryButton>
        </View>
        {watchlistError ? <Text style={styles.watchlistError}>{watchlistError}</Text> : null}
        {watchlistLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading watchlist…</Text>
          </View>
        ) : watchlistQuotes.length === 0 ? (
          <Text style={[styles.watchlistEmpty, { color: colors.mutedForeground }]}>No symbols saved yet.</Text>
        ) : (
          <View style={styles.watchlistList}>
            {watchlistQuotes.map(({ item, quote }) => (
              <View key={item.id} style={[styles.watchlistRow, { borderColor: colors.border }]}> 
                <View style={{ flex: 1 }}>
                  <View style={styles.watchlistTopRow}>
                    <Text style={[styles.watchlistSymbol, { color: colors.foreground }]}>{item.symbol}</Text>
                    {quote ? (
                      <Text style={[styles.watchlistChange, { color: changeColor(quote.changePercent, '#7AE2AA', '#E27A7A', colors.mutedForeground) }]}>
                        {quote.changePercent >= 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%
                      </Text>
                    ) : (
                      <Tag tone="muted">No quote yet</Tag>
                    )}
                  </View>
                  <Text style={[styles.watchlistMeta, { color: colors.mutedForeground }]}>
                    {quote ? `${formatPrice(quote.price, quote.symbol)}${item.targetPrice ? ` · Target ${item.targetPrice}` : ''}` : `${item.targetPrice ? `Target ${item.targetPrice}` : 'Waiting for market quote'}`}
                  </Text>
                  {item.note ? <Text style={[styles.watchlistNote, { color: colors.mutedForeground }]}>{item.note}</Text> : null}
                </View>
                <Pressable onPress={() => void removeItem(item.id)} style={styles.watchlistDelete} accessibilityRole="button">
                  <Ionicons name="trash-outline" size={18} color={colors.destructive} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </Card>

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

      {/* Learning CTA */}
      <Card style={styles.learningCard} onPress={openLearning}>
        <View style={styles.learningRow}>
          <View style={[styles.learningBadge, { backgroundColor: colors.secondary }]}>
            <Ionicons name="school-outline" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.learningKicker, { color: colors.primary }]}>THE ACADEMY</Text>
            <Text style={[styles.learningTitle, { color: colors.foreground }]}>Keep leveling up.</Text>
            <Text style={[styles.learningBody, { color: colors.mutedForeground }]}>
              Candlesticks, indicators, market history — gamified, beginner to expert.
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

// Each key matches a `group` value the API tags quotes with (see
// routes/market.ts EQUITY_TICKERS/CRYPTO_TICKERS). "sectors" holds the 11
// SPDR sector ETFs — a real sector heatmap. Individual mega-cap stocks are
// grouped by their own real sector (technology/consumer-discretionary/
// communication-services) rather than a generic "Mega-cap" bucket, so this
// switcher doubles as an accurate per-stock sector view too.
const HEAT_GROUPS: { key: string; label: string }[] = [
  { key: 'sectors', label: 'Sector ETFs' },
  { key: 'indices', label: 'Indices' },
  { key: 'technology', label: 'Technology' },
  { key: 'consumer-discretionary', label: 'Cons. Discretionary' },
  { key: 'communication-services', label: 'Communications' },
  { key: 'financials', label: 'Financials' },
  { key: 'macro', label: 'Macro' },
  { key: 'crypto', label: 'Crypto' },
];

function formatVolume(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

function SectorHeatmap({ quotes, loading }: { quotes: QuoteItem[]; loading: boolean }) {
  const colors = useColors();
  const [activeGroup, setActiveGroup] = React.useState('sectors');
  const [expandedSymbol, setExpandedSymbol] = React.useState<string | null>(null);

  const shown = quotes.filter((q) => q.group === activeGroup).slice(0, 14);
  const expanded = expandedSymbol ? shown.find((q) => q.symbol === expandedSymbol) ?? null : null;

  const selectGroup = (key: string) => {
    if (key === activeGroup) return;
    void Haptics.selectionAsync();
    setActiveGroup(key);
    setExpandedSymbol(null);
  };

  const toggleTile = (symbol: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedSymbol((prev) => (prev === symbol ? null : symbol));
  };

  return (
    <View style={styles.heatSection}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.heatPillRow}>
        {HEAT_GROUPS.map((g) => {
          const active = g.key === activeGroup;
          return (
            <Pressable
              key={g.key}
              onPress={() => selectGroup(g.key)}
              style={[
                styles.heatPill,
                {
                  backgroundColor: active ? colors.primary : colors.secondary,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.heatPillText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{g.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading && shown.length === 0 ? (
        <View style={[styles.heatPlaceholder, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <ActivityIndicator color={colors.primary} size="small" />
        </View>
      ) : (
        <View style={styles.heatGrid}>
          {!loading && shown.length === 0 ? (
            <View style={[styles.heatPlaceholder, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>No symbols available for this view yet.</Text>
            </View>
          ) : null}
          {shown.map((q) => {
            const pct = q.changePercent;
            const bg = pct >= 2 ? '#0d3322' : pct >= 0.5 ? '#13281c' : pct >= -0.5 ? '#1a1a2e' : pct >= -2 ? '#2d0f0f' : '#3d0808';
            const textColor = pct >= 0.5 ? '#7AE2AA' : pct >= -0.5 ? colors.mutedForeground : '#E27A7A';
            const label = q.symbol.replace('-USD', '').replace('^', '');
            const isExpanded = q.symbol === expandedSymbol;
            return (
              <Pressable
                key={q.symbol}
                onPress={() => toggleTile(q.symbol)}
                style={[
                  styles.heatCell,
                  { backgroundColor: bg, borderColor: isExpanded ? colors.primary : colors.border },
                  isExpanded && styles.heatCellActive,
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.heatTicker, { color: colors.foreground }]}>{label}</Text>
                <Text style={[styles.heatPct, { color: textColor }]}>
                  {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {expanded ? (
        <View style={[styles.heatDetail, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={styles.heatDetailHeader}>
            <Text style={[styles.heatDetailName, { color: colors.foreground }]}>{expanded.shortName}</Text>
            <Pressable onPress={() => setExpandedSymbol(null)} accessibilityRole="button">
              <Ionicons name="close" size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <View style={styles.heatDetailRow}>
            <View style={styles.heatDetailStat}>
              <Text style={[styles.heatDetailLabel, { color: colors.mutedForeground }]}>Price</Text>
              <Text style={[styles.heatDetailValue, { color: colors.foreground }]}>{formatPrice(expanded.price, expanded.symbol)}</Text>
            </View>
            <View style={styles.heatDetailStat}>
              <Text style={[styles.heatDetailLabel, { color: colors.mutedForeground }]}>Change</Text>
              <Text style={[styles.heatDetailValue, { color: changeColor(expanded.changePercent, '#7AE2AA', '#E27A7A', colors.mutedForeground) }]}>
                {expanded.change >= 0 ? '+' : ''}{expanded.change.toFixed(2)} ({expanded.changePercent >= 0 ? '+' : ''}{expanded.changePercent.toFixed(2)}%)
              </Text>
            </View>
            {expanded.volume ? (
              <View style={styles.heatDetailStat}>
                <Text style={[styles.heatDetailLabel, { color: colors.mutedForeground }]}>Volume</Text>
                <Text style={[styles.heatDetailValue, { color: colors.foreground }]}>{formatVolume(expanded.volume)}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <Text style={[styles.heatHint, { color: colors.mutedForeground }]}>Tap a group to switch views, tap a tile for detail.</Text>
      )}
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
  heroWelcome: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginBottom: 8 },
  heroKicker: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, marginBottom: 8 },
  heroTitle: { fontSize: 26, fontFamily: 'Inter_700Bold', letterSpacing: -0.7, lineHeight: 30, marginBottom: 10 },
  heroBody: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  orbit: { width: 80, height: 80, borderRadius: 40, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  orbitInner: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  orbitDot: { width: 8, height: 8, borderRadius: 4 },
  metricsCard: { marginBottom: 22 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  loadingText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  metricScroll: { gap: 14, paddingRight: 8 },
  metricCardWrap: { minWidth: 110 },
  microLine: { height: 1, marginTop: 14, marginBottom: 10 },
  microText: { fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 10, textAlign: 'center', letterSpacing: 0.5 },
  heatSection: { marginBottom: 22 },
  heatPillRow: { gap: 8, paddingRight: 8, marginBottom: 12 },
  heatPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  heatPillText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  heatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heatCell: { width: '22%', flexGrow: 1, borderRadius: 12, borderWidth: 1, padding: 10, alignItems: 'center', minHeight: 60, justifyContent: 'center' },
  heatCellActive: { borderWidth: 1.5 },
  heatTicker: { fontSize: 10, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  heatPct: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  heatPlaceholder: { height: 80, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  heatDetail: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 10 },
  heatDetailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  heatDetailName: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  heatDetailRow: { flexDirection: 'row', gap: 20 },
  heatDetailStat: { gap: 3 },
  heatDetailLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, textTransform: 'uppercase' },
  heatDetailValue: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  heatHint: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 10, textAlign: 'center' },
  watchlistCard: { marginBottom: 22 },
  adminCard: { marginBottom: 22 },
  adminActions: { gap: 10 },
  watchlistIntro: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 16, marginBottom: 14 },
  watchlistForm: { gap: 10, marginBottom: 14 },
  watchlistInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Inter_400Regular' },
  watchlistList: { gap: 10 },
  watchlistRow: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  watchlistTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  watchlistSymbol: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  watchlistChange: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  watchlistMeta: { fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: 4 },
  watchlistNote: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 6, lineHeight: 16 },
  watchlistDelete: { padding: 6 },
  watchlistEmpty: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  watchlistError: { color: '#ef4444', fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 10 },
  signalTeaser: { marginBottom: 14 },
  signalTeaserRow: { flexDirection: 'row', alignItems: 'center' },
  signalBadge: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  signalTeaserTitle: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  signalTeaserBody: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  learningCard: { marginBottom: 14 },
  learningRow: { flexDirection: 'row', alignItems: 'center' },
  learningBadge: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  learningKicker: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, marginBottom: 4 },
  learningTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', marginBottom: 3 },
  learningBody: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  mentorCard: { borderWidth: 1.5, marginBottom: 10 },
  mentorKicker: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, marginBottom: 8 },
  mentorTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', letterSpacing: -0.5, marginBottom: 7 },
  mentorBody: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17, marginBottom: 16 },
});
