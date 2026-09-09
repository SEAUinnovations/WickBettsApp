import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Header, PrimaryButton, Screen, SectionLabel, Tag } from '@/components/WickUI';
import { CancelSubscriptionButton, LapsedRecovery, ManageBillingButton, ResumeSubscriptionButton, SubscribePanel } from '@/components/Billing';
import { useAuth, type Plan } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { API_BASE } from '@/lib/apiUrl';

const TIMEZONES = [
  { label: 'New York (ET)', value: 'America/New_York' },
  { label: 'Chicago (CT)', value: 'America/Chicago' },
  { label: 'Denver (MT)', value: 'America/Denver' },
  { label: 'Los Angeles (PT)', value: 'America/Los_Angeles' },
];

const PLAN_LABELS: Record<string, string> = {
  signals: 'Wick Betts Signals',
  mentorship: 'Wick Betts Mentorship',
  membership: 'Wick Betts Membership',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  trialing: 'Trial',
  past_due: 'Past due',
  canceled: 'Cancelled',
  incomplete: 'Incomplete',
};

const ACTIVE_STATUSES = ['active', 'trialing'];

function formatRenewalDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function SettingsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user, getToken, subscription, refreshSubscription, updateNotificationPrefs } = useAuth();
  const [savingTimezone, setSavingTimezone] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [savingPref, setSavingPref] = useState<'notifySignals' | 'notifyNews' | null>(null);

  const hasStripeCustomer = user?.hasStripeCustomer ?? false;
  const isActive = subscription ? ACTIVE_STATUSES.includes(subscription.status) : false;
  const isLapsed = subscription ? !isActive : false;

  const currentTimezone = user?.timezone || 'America/New_York';

  const saveTimezone = async (timezone: string) => {
    setSavingTimezone(timezone);
    setError('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${API_BASE}/auth/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ timezone }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? 'Could not save timezone.');
      }
      await refreshSubscription();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save timezone.');
    } finally {
      setSavingTimezone(null);
    }
  };

  // PATCH /api/auth/notifications, then sync AuthContext's local copy so the
  // switch (and anywhere else that reads user.notifySignals/notifyNews)
  // reflects it immediately — see AuthContext.tsx's updateNotificationPrefs,
  // which was already wired up for this but had no settings UI calling it.
  const togglePref = async (key: 'notifySignals' | 'notifyNews', next: boolean) => {
    setSavingPref(key);
    setError('');
    updateNotificationPrefs({ [key]: next });
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${API_BASE}/auth/notifications`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ [key]: next }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? 'Could not save notification preference.');
      }
    } catch (err) {
      updateNotificationPrefs({ [key]: !next }); // revert the optimistic flip
      setError(err instanceof Error ? err.message : 'Could not save notification preference.');
    } finally {
      setSavingPref(null);
    }
  };

  return (
    <Screen contentStyle={styles.content}>
      <Header eyebrow="Wick Betts / Account" title="Settings" onAction={() => router.back()} />

      <SectionLabel>Notifications</SectionLabel>
      <Card style={styles.card}>
        <View style={styles.prefRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.prefTitle, { color: colors.foreground }]}>Signal alerts</Text>
            <Text style={[styles.subtitle, styles.noMargin, { color: colors.mutedForeground }]}>
              Push + email the moment a new setup is published.
            </Text>
          </View>
          {savingPref === 'notifySignals' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Switch
              value={user?.notifySignals ?? true}
              onValueChange={(next) => void togglePref('notifySignals', next)}
              trackColor={{ false: colors.secondary, true: colors.primary }}
              thumbColor={colors.foreground}
            />
          )}
        </View>
        <View style={[styles.prefRow, styles.prefRowLast, { borderTopColor: colors.border }]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.prefTitle, { color: colors.foreground }]}>Market news alerts</Text>
            <Text style={[styles.subtitle, styles.noMargin, { color: colors.mutedForeground }]}>
              Push + email for market-impacting news only — not every headline.
            </Text>
          </View>
          {savingPref === 'notifyNews' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Switch
              value={user?.notifyNews ?? false}
              onValueChange={(next) => void togglePref('notifyNews', next)}
              trackColor={{ false: colors.secondary, true: colors.primary }}
              thumbColor={colors.foreground}
            />
          )}
        </View>
        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
      </Card>

      <SectionLabel>Timezone</SectionLabel>
      <Card style={styles.card}>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Stored in your account profile.</Text>
        <View style={styles.timezoneList}>
          {TIMEZONES.map((tz) => {
            const active = tz.value === currentTimezone;
            return (
              <Pressable
                key={tz.value}
                onPress={() => void saveTimezone(tz.value)}
                disabled={savingTimezone !== null}
                style={({ pressed }) => [
                  styles.timezoneRow,
                  {
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.secondary : colors.card,
                    opacity: pressed ? 0.86 : 1,
                  },
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.timezoneText, { color: colors.foreground }]}>{tz.label}</Text>
                {savingTimezone === tz.value ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : active ? (
                  <Text style={[styles.activeBadge, { color: colors.primary }]}>Current</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
      </Card>

      <SectionLabel>Billing</SectionLabel>
      <Card style={styles.card}>
        {subscription ? (
          <>
            <View style={styles.billingHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.planName, { color: colors.foreground }]}>
                  {PLAN_LABELS[subscription.plan] ?? subscription.plan}
                </Text>
                <Text style={[styles.subtitle, styles.noMargin, { color: colors.mutedForeground }]}>
                  {subscription.currentPeriodEnd
                    ? `${subscription.cancelAtPeriodEnd ? 'Cancels' : 'Renews'} ${formatRenewalDate(subscription.currentPeriodEnd)}`
                    : 'Status: ' + (STATUS_LABELS[subscription.status] ?? subscription.status)}
                </Text>
              </View>
              <Tag tone={isActive ? 'green' : 'orange'}>{STATUS_LABELS[subscription.status] ?? subscription.status}</Tag>
            </View>
            {isLapsed ? (
              <View style={styles.billingActions}>
                <LapsedRecovery status={subscription.status} plan={subscription.plan as Plan} hasStripeCustomer={hasStripeCustomer} />
              </View>
            ) : subscription.cancelAtPeriodEnd ? (
              <View style={styles.billingActions}>
                <ResumeSubscriptionButton />
                <ManageBillingButton />
              </View>
            ) : (
              <View style={styles.billingActions}>
                <ManageBillingButton />
                <CancelSubscriptionButton
                  renewalDate={subscription.currentPeriodEnd ? formatRenewalDate(subscription.currentPeriodEnd) : null}
                />
              </View>
            )}
          </>
        ) : (
          <>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              No active subscription. Purchases open Stripe Checkout in your browser for secure payment handling.
            </Text>
            <SubscribePanel />
          </>
        )}
        <PrimaryButton onPress={() => router.push('/legal' as never)} icon="document-text-outline">Read legal disclosures</PrimaryButton>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 108 },
  card: { marginBottom: 8 },
  prefRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  prefRowLast: { borderTopWidth: 1 },
  prefTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginBottom: 3 },
  subtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18, marginBottom: 14 },
  noMargin: { marginBottom: 0, marginTop: 3 },
  billingHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, gap: 10 },
  planName: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  billingActions: { marginBottom: 14 },
  timezoneList: { gap: 10 },
  timezoneRow: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timezoneText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  activeBadge: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  error: { marginTop: 12, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});