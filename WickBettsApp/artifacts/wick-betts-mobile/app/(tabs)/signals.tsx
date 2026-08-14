import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Card, Header, Screen, SectionLabel, Tag } from '@/components/WickUI';
import { LapsedRecovery, SubscribePanel } from '@/components/Billing';
import { useColors } from '@/hooks/useColors';
import { useAuth, type Plan } from '@/context/AuthContext';
import { useSignals, type Signal, type SignalStatus } from '@/context/SignalContext';

type Filter = 'All' | 'Stocks' | 'Crypto' | 'Options' | 'Buy & Hold' | 'LEAPS' | 'Active' | 'Closed';

// Tapping a signal's status pill (admin only) advances it one step around
// this cycle — most usefully Watching -> Active, the moment an
// auto-generated "Watching" signal becomes the live call that's shared
// throughout the app (push + email fan-out fires on that exact transition;
// see the PATCH /api/signals/:id handler).
const STATUS_CYCLE: SignalStatus[] = ['Watching', 'Active', 'Closed', 'Stopped'];
function nextStatus(current: SignalStatus): SignalStatus {
  const idx = STATUS_CYCLE.indexOf(current);
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}

export default function SignalsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { subscription, user } = useAuth();
  const { signals, isLoading, isSubscriptionRequired, error, refresh, updateSignal, deleteSignal } = useSignals();
  const isAdmin = user?.role === 'admin';
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Re-fetch whenever this tab gains focus so a signal an admin just
  // published (from the Signal studio, or another device) shows up as soon
  // as a member switches to this tab, instead of only on app cold-start.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  const [filter, setFilter] = useState<Filter>('All');
  const [expanded, setExpanded] = useState<string | null>(null);
  const visibleSignals = useMemo(
    () =>
      signals.filter(
        (signal) =>
          filter === 'All' ||
          signal.market === filter ||
          signal.status === filter ||
          (filter === 'Options' && signal.isOption) ||
          signal.style === filter,
      ),
    [filter, signals],
  );

  const advanceStatus = async (signal: Signal) => {
    setUpdatingId(signal.id);
    try {
      await updateSignal(signal.id, { status: nextStatus(signal.status) });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Could not update status', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setUpdatingId(null);
    }
  };

  const removeSignal = async (signal: Signal) => {
    setRemovingId(signal.id);
    try {
      await deleteSignal(signal.id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Could not remove signal', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setRemovingId(null);
    }
  };

  // Alert.alert's multi-button dialogs silently no-op on react-native-web, so
  // use window.confirm there (same pattern used in the signal studio).
  const confirmRemove = (signal: Signal) => {
    const label = signal.source === 'auto' ? `Dismiss the auto-generated ${signal.asset} signal?` : `Delete the ${signal.asset} signal?`;
    if (Platform.OS === 'web') {
      if (window.confirm(label)) void removeSignal(signal);
      return;
    }
    Alert.alert(
      signal.source === 'auto' ? 'Dismiss signal' : 'Delete signal',
      `${label} This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: signal.source === 'auto' ? 'Dismiss' : 'Delete', style: 'destructive', onPress: () => void removeSignal(signal) },
      ],
    );
  };

  return (
    <Screen contentStyle={styles.content}>
      <Header eyebrow="Wick Betts / Intelligence" title="Signals" action="Alerts" onAction={() => router.push('/news')} />

      {/* Subscription required gate */}
      {isSubscriptionRequired ? (
        <Card style={styles.gateCard}>
          <Ionicons name="lock-closed-outline" size={28} color={colors.primary} style={styles.gateIcon} />
          <Text style={[styles.gateTitle, styles.gateCenter, { color: colors.foreground }]}>
            {subscription?.status === 'past_due' ? 'Payment past due' : 'Subscription required'}
          </Text>
          <Text style={[styles.gateText, { color: colors.mutedForeground }]}>
            {subscription?.status === 'past_due'
              ? "Your last payment didn't go through. Update your payment method to restore access to the signal feed."
              : subscription
              ? 'An active Wick Betts subscription is needed to access the signal feed. Re-subscribe below to get back in.'
              : 'An active Wick Betts subscription is needed to access the signal feed. Choose a plan below to join the desk.'}
          </Text>
          <View style={styles.gateActions}>
            {subscription ? (
              <LapsedRecovery
                status={subscription.status}
                plan={subscription.plan as Plan}
                hasStripeCustomer={user?.hasStripeCustomer ?? false}
              />
            ) : (
              <SubscribePanel />
            )}
          </View>
        </Card>
      ) : error ? (
        <Card style={styles.gateCard}>
          <Ionicons name="cloud-offline-outline" size={28} color={colors.mutedForeground} />
          <Text style={[styles.gateTitle, { color: colors.foreground }]}>Could not load signals</Text>
          <Text style={[styles.gateText, { color: colors.mutedForeground }]}>{error}</Text>
          <Pressable onPress={() => void refresh()} style={[styles.retryButton, { borderColor: colors.border }]}>
            <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
          </Pressable>
        </Card>
      ) : null}
      <View style={[styles.intro, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <View style={styles.introIcon}>
          <Ionicons name="pulse-outline" size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.introTitle, { color: colors.foreground }]}>Read the setup, not just the call.</Text>
          <Text style={[styles.introBody, { color: colors.mutedForeground }]}>
            Stocks, crypto, and options contracts with the levels and Greeks behind every setup.
          </Text>
        </View>
      </View>
      {isAdmin ? (
        <Card style={styles.adminCard}>
          <Text style={[styles.introBody, { color: colors.mutedForeground }]}>Admin quick action: jump into the signal studio while reviewing the live feed.</Text>
          <View style={styles.adminActions}>
            <Pressable onPress={() => router.push('/admin')} style={[styles.retryButton, { borderColor: colors.border }]}>
              <Text style={[styles.retryText, { color: colors.primary }]}>Open signal studio</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}
      <SectionLabel>Signal history</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {(['All', 'Stocks', 'Crypto', 'Options', 'Buy & Hold', 'LEAPS', 'Active', 'Closed'] as Filter[]).map((item) => (
          <Pressable
            key={item}
            onPress={() => setFilter(item)}
            style={[
              styles.filter,
              {
                backgroundColor: filter === item ? colors.primary : colors.card,
                borderColor: filter === item ? colors.primary : colors.border,
              },
            ]}
          >
            <Text style={[styles.filterText, { color: filter === item ? colors.primaryForeground : colors.mutedForeground }]}>
              {item}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {visibleSignals.map((signal) => (
        <SignalCard
          key={signal.id}
          signal={signal}
          expanded={expanded === signal.id}
          onPress={() => setExpanded(expanded === signal.id ? null : signal.id)}
          isAdmin={isAdmin}
          updatingStatus={updatingId === signal.id}
          removing={removingId === signal.id}
          onAdvanceStatus={() => void advanceStatus(signal)}
          onRemove={() => confirmRemove(signal)}
        />
      ))}
      {visibleSignals.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="search-outline" size={22} color={colors.primary} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No signals in this view</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Try another filter or check back after the next market briefing.</Text>
        </Card>
      ) : null}
      <Text style={[styles.note, { color: colors.mutedForeground }]}>Past signals remain visible for transparency. Educational content only.</Text>
    </Screen>
  );
}

function SignalCard({
  signal,
  expanded,
  onPress,
  isAdmin = false,
  updatingStatus = false,
  removing = false,
  onAdvanceStatus,
  onRemove,
}: {
  signal: Signal;
  expanded: boolean;
  onPress: () => void;
  isAdmin?: boolean;
  updatingStatus?: boolean;
  removing?: boolean;
  onAdvanceStatus?: () => void;
  onRemove?: () => void;
}) {
  const colors = useColors();
  const tone = signal.status === 'Active' ? 'green' : signal.status === 'Watching' ? 'orange' : 'muted';
  return (
    <Card onPress={onPress} style={[styles.signalCard, removing && { opacity: 0.5 }]}>
      <View style={styles.row}>
        <View style={[styles.assetIcon, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.assetText, { color: colors.accent }]}>{signal.asset.slice(0, 2)}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={styles.titleLine}>
            <Text style={[styles.assetName, { color: colors.foreground }]}>{signal.asset}</Text>
            {signal.isOption ? <Tag>OPTION</Tag> : null}
            {signal.style && signal.style !== 'Swing' ? <Tag tone="orange">{signal.style}</Tag> : null}
            {isAdmin && onAdvanceStatus ? (
              <Pressable
                onPress={onAdvanceStatus}
                disabled={updatingStatus || removing}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Advance status, currently ${signal.status}`}
                testID={`advance-status-${signal.id}`}
              >
                <Tag tone={tone}>{updatingStatus ? 'Updating…' : signal.status}</Tag>
              </Pressable>
            ) : (
              <Tag tone={tone}>{signal.status}</Tag>
            )}
            {signal.newsAlert ? (
              <Ionicons name="star" size={14} color="#E2C25A" accessibilityLabel="Keep in mind: near a major news event" />
            ) : null}
          </View>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            {signal.market} · {signal.timeframe} · {signal.direction}
          </Text>
        </View>
        {isAdmin && onRemove ? (
          <Pressable
            onPress={onRemove}
            disabled={removing}
            hitSlop={8}
            style={styles.removeIcon}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${signal.asset} signal`}
            testID={`remove-signal-${signal.id}`}
          >
            <Ionicons name="close-circle" size={19} color={colors.destructive} />
          </Pressable>
        ) : null}
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={colors.mutedForeground} />
      </View>
      {isAdmin ? (
        <Text style={[styles.adminHint, { color: colors.mutedForeground }]}>
          Tap the status to advance it (Watching → Active shares it live). Tap ✕ to remove.
        </Text>
      ) : null}
      {signal.isOption ? (
        <View style={[styles.contract, { backgroundColor: colors.muted }]}>
          <Text style={[styles.contractLabel, { color: colors.primary }]}>CONTRACT</Text>
          <Text style={[styles.contractName, { color: colors.foreground }]}>{signal.contract}</Text>
          <View style={styles.contractMeta}>
            <Text style={[styles.contractMetaText, { color: colors.mutedForeground }]}>Expiry {signal.expiration}</Text>
            <Text style={[styles.contractMetaText, { color: colors.mutedForeground }]}>Strike {signal.strike}</Text>
            <Text style={[styles.contractMetaText, { color: colors.mutedForeground }]}>Premium {signal.premium}</Text>
          </View>
        </View>
      ) : null}
      <View style={[styles.levels, { borderTopColor: colors.border }]}>
        <View><Text style={[styles.levelLabel, { color: colors.mutedForeground }]}>{signal.isOption ? 'Debit' : signal.style === 'Buy & Hold' ? 'Entry zone' : 'Entry'}</Text><Text style={[styles.levelValue, { color: colors.foreground }]}>{signal.entry}</Text></View>
        <View><Text style={[styles.levelLabel, { color: colors.mutedForeground }]}>{signal.style === 'Buy & Hold' ? 'Long-term target' : 'Target'}</Text><Text style={[styles.levelValue, { color: colors.accent }]}>{signal.target}</Text></View>
        {signal.stop ? (
          <View><Text style={[styles.levelLabel, { color: colors.mutedForeground }]}>Stop</Text><Text style={[styles.levelValue, { color: colors.destructive }]}>{signal.stop}</Text></View>
        ) : null}
      </View>
      {!signal.stop && signal.style === 'Buy & Hold' ? (
        <Text style={[styles.noStopNote, { color: colors.mutedForeground }]}>No hard stop — long-term thesis, not a swing trade.</Text>
      ) : null}
      {expanded ? (
        <>
          {signal.isOption ? <Greeks signal={signal} /> : null}
          {signal.newsAlert ? (
            <View style={[styles.newsAlert, { backgroundColor: '#241d0a', borderColor: '#5c4a14' }]}>
              <Ionicons name="star" size={14} color="#E2C25A" />
              <Text style={[styles.newsAlertText, { color: '#E2C25A' }]}>
                {signal.newsAlertNote ?? 'Keep in mind: this window overlaps a major market news event.'}
              </Text>
            </View>
          ) : null}
          <View style={[styles.analysis, { backgroundColor: colors.muted }]}>
            <Text style={[styles.analysisLabel, { color: colors.primary }]}>WICK&apos;S READ</Text>
            <Text style={[styles.analysisText, { color: colors.mutedForeground }]}>{signal.analysis}</Text>
          </View>
          <Text style={[styles.postedAt, { color: colors.mutedForeground }]}>
            {signal.postedAt}
          </Text>
        </>
      ) : null}
    </Card>
  );
}

function Greeks({ signal }: { signal: Signal }) {
  const colors = useColors();
  return (
    <View style={[styles.greeks, { borderTopColor: colors.border }]}>
      <View style={styles.greeksHeader}>
        <Text style={[styles.greeksTitle, { color: colors.foreground }]}>Option Greeks</Text>
        <Text style={[styles.iv, { color: colors.accent }]}>IV {signal.impliedVolatility}</Text>
      </View>
      <View style={styles.greekGrid}>
        <Greek label="Delta" value={signal.delta?.toFixed(2) ?? '—'} />
        <Greek label="Gamma" value={signal.gamma?.toFixed(3) ?? '—'} />
        <Greek label="Theta" value={signal.theta?.toFixed(2) ?? '—'} />
        <Greek label="Vega" value={signal.vega?.toFixed(2) ?? '—'} />
      </View>
      <View style={styles.quoteRow}>
        <Text style={[styles.quoteText, { color: colors.mutedForeground }]}>Bid {signal.bid}</Text>
        <Text style={[styles.quoteText, { color: colors.mutedForeground }]}>Ask {signal.ask}</Text>
        <Text style={[styles.quoteText, { color: colors.mutedForeground }]}>OI {signal.openInterest}</Text>
      </View>
    </View>
  );
}

function Greek({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.greek}>
      <Text style={[styles.greekLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.greekValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 110 },
  intro: { borderWidth: 1, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  introIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#25133A', alignItems: 'center', justifyContent: 'center' },
  introTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  introBody: { fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 16 },
  adminCard: { marginBottom: 16 },
  adminActions: { marginTop: 10 },
  filters: { gap: 8, paddingBottom: 14 },
  filter: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  filterText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  signalCard: { marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  assetIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  assetText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  assetName: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  meta: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4 },
  removeIcon: { paddingHorizontal: 6, paddingVertical: 2, marginRight: 4 },
  adminHint: { fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 10, fontStyle: 'italic' },
  contract: { borderRadius: 12, padding: 12, marginTop: 15 },
  contractLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, marginBottom: 5 },
  contractName: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  contractMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  contractMetaText: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  levels: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, marginTop: 16, paddingTop: 14 },
  levelLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', marginBottom: 4 },
  levelValue: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  noStopNote: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 8, fontStyle: 'italic' },
  greeks: { borderTopWidth: 1, paddingTop: 15, marginTop: 15 },
  greeksHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  greeksTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  iv: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  greekGrid: { flexDirection: 'row', gap: 8 },
  greek: { flex: 1, backgroundColor: '#171321', borderRadius: 10, padding: 9 },
  greekLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', marginBottom: 5 },
  greekValue: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  quoteRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 11 },
  quoteText: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  newsAlert: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 12, padding: 11, marginTop: 15 },
  newsAlertText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  analysis: { padding: 12, borderRadius: 12, marginTop: 15 },
  analysisLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 6 },
  analysisText: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  postedAt: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 11 },
  emptyCard: { alignItems: 'center', paddingVertical: 28, marginBottom: 14 },
  emptyTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', marginTop: 10 },
  emptyText: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 5 },
  note: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 10 },
  gateCard: { alignItems: 'stretch', paddingVertical: 36, marginBottom: 14, gap: 12 },
  gateActions: { marginTop: 6 },
  gateIcon: { alignSelf: 'center' },
  gateCenter: { textAlign: 'center' },
  gateTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  gateText: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 12 },
  retryButton: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 9, marginTop: 4 },
  retryText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});