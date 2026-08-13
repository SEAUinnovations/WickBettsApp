import React, { useState, useCallback, useEffect } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card, Header, PrimaryButton, Screen, SectionLabel, Tag } from '@/components/WickUI';
import {
  CancelSubscriptionButton,
  LapsedRecovery,
  ManageBillingButton,
  ResumeSubscriptionButton,
  SubscribePanel,
  UpgradeMentorshipButton,
} from '@/components/Billing';
import { useColors } from '@/hooks/useColors';
import { useAuth, type Plan } from '@/context/AuthContext';
import { API_BASE } from '@/lib/apiUrl';

/** Statuses that still grant desk access. Everything else needs recovery. */
const ACTIVE_STATUSES = ['active', 'trialing'];

const PLAN_LABELS: Record<string, string> = {
  signals: 'Wick Betts Signals',
  mentorship: 'Wick Betts Mentorship',
  membership: 'Wick Betts Membership',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  trialing: 'Trial',
  past_due: 'Past Due',
  canceled: 'Cancelled',
  incomplete: 'Incomplete',
};

export default function ProfileScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user, getToken, subscription, isLoading, signOut, updateNotificationPrefs } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  // Notification preferences — initialised from user object so they survive re-renders
  const [notifySignals, setNotifySignals] = useState(() => user?.notifySignals ?? true);
  const [notifyNews, setNotifyNews] = useState(() => user?.notifyNews ?? false);
  // Master push toggle: on when either signal or news pref is on
  const [pushMaster, setPushMaster] = useState(() => (user?.notifySignals ?? true) || (user?.notifyNews ?? false));

  useEffect(() => {
    const nextSignals = user?.notifySignals ?? true;
    const nextNews = user?.notifyNews ?? false;
    setNotifySignals(nextSignals);
    setNotifyNews(nextNews);
    setPushMaster(nextSignals || nextNews);
  }, [user?.id, user?.notifySignals, user?.notifyNews]);

  const isAdmin = user?.role === 'admin';
  const timezoneLabel = user?.timezone || 'New York (ET)';

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const planLabel = subscription ? (PLAN_LABELS[subscription.plan] ?? subscription.plan) : null;
  const statusLabel = subscription ? (STATUS_LABELS[subscription.status] ?? subscription.status) : null;
  const isActive = subscription ? ACTIVE_STATUSES.includes(subscription.status) : false;
  const isLapsed = subscription ? !isActive : false;
  const isMentorship = subscription?.plan === 'mentorship';
  const hasStripeCustomer = user?.hasStripeCustomer ?? false;
  const renewalDateLabel = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  /** Persist a preference change to the API and update context. */
  const savePrefs = useCallback(async (prefs: { notifySignals?: boolean; notifyNews?: boolean }) => {
    updateNotificationPrefs(prefs);
    const authToken = await getToken();
    try {
      await fetch(`${API_BASE}/auth/notifications`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(prefs),
      });
    } catch {
      // Silently ignore network errors — prefs will re-sync on next login
    }
  }, [getToken, updateNotificationPrefs]);

  const handlePushMaster = useCallback(async (value: boolean) => {
    setPushMaster(value);
    const newSignals = value ? true : false;
    const newNews = value ? notifyNews : false;
    setNotifySignals(newSignals);
    if (!value) setNotifyNews(false);
    await savePrefs({ notifySignals: newSignals, notifyNews: value ? notifyNews : false });
  }, [notifyNews, savePrefs]);

  const handleSignalsToggle = useCallback(async (value: boolean) => {
    setNotifySignals(value);
    if (value) setPushMaster(true);
    await savePrefs({ notifySignals: value });
  }, [savePrefs]);

  const handleNewsToggle = useCallback(async (value: boolean) => {
    setNotifyNews(value);
    if (value) setPushMaster(true);
    await savePrefs({ notifyNews: value });
  }, [savePrefs]);

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          await signOut();
          setSigningOut(false);
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <Screen contentStyle={styles.content}>
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.content}>
      <Header eyebrow="Wick Betts / Account" title="Profile" action="Settings" onAction={() => router.push('/settings' as never)} />

      {/* Profile header */}
      <View style={styles.profileHeader}>
        <View style={[styles.largeAvatar, { backgroundColor: colors.primary }]}>
          <Text style={[styles.largeAvatarText, { color: colors.primaryForeground }]}>{initials}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={[styles.name, { color: colors.foreground }]}>{user?.name ?? 'Member'}</Text>
          <Text style={[styles.email, { color: colors.mutedForeground }]}>{user?.email ?? ''}</Text>
        </View>
        {isAdmin ? (
          <Tag tone="green">ADMIN</Tag>
        ) : subscription ? (
          <Tag>
            {planLabel?.includes('Mentorship')
              ? 'MENTORSHIP'
              : planLabel?.includes('Membership')
                ? 'MEMBERSHIP'
                : 'SIGNALS'}
          </Tag>
        ) : null}
      </View>

      {/* Membership */}
      <SectionLabel>Membership</SectionLabel>
      {subscription ? (
        <Card style={styles.membership}>
          <View style={styles.membershipTop}>
            <View>
              <Text style={[styles.planName, { color: colors.foreground }]}>{planLabel}</Text>
              <Text style={[styles.planMeta, { color: colors.mutedForeground }]}>
                Status: {statusLabel}
                {renewalDateLabel ? `  ·  ${subscription.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${renewalDateLabel}` : ''}
              </Text>
            </View>
          </View>

          {isLapsed ? (
            <>
              <View style={[styles.noSubRow, { backgroundColor: colors.muted }]}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.destructive} />
                <Text style={[styles.noSubText, { color: colors.mutedForeground }]}>
                  {subscription.status === 'past_due'
                    ? "Your last payment didn't go through. Update your payment method to restore access."
                    : 'Your membership has lapsed. Re-subscribe to get back into the desk.'}
                </Text>
              </View>
              <LapsedRecovery
                status={subscription.status}
                plan={subscription.plan as Plan}
                hasStripeCustomer={hasStripeCustomer}
              />
            </>
          ) : subscription.cancelAtPeriodEnd ? (
            <>
              <View style={[styles.noSubRow, { backgroundColor: colors.muted }]}>
                <Ionicons name="information-circle-outline" size={18} color={colors.mutedForeground} />
                <Text style={[styles.noSubText, { color: colors.mutedForeground }]}>
                  Your subscription is set to cancel{renewalDateLabel ? ` on ${renewalDateLabel}` : ''}. You keep access until then.
                </Text>
              </View>
              <View style={styles.membershipActions}>
                <ResumeSubscriptionButton />
                <ManageBillingButton />
              </View>
            </>
          ) : (
            <View style={styles.membershipActions}>
              {isMentorship ? (
                <PrimaryButton onPress={() => router.push('/mentorship')} icon="calendar-outline">
                  Manage membership
                </PrimaryButton>
              ) : (
                <UpgradeMentorshipButton />
              )}
              <ManageBillingButton />
              <CancelSubscriptionButton renewalDate={renewalDateLabel} />
            </View>
          )}
        </Card>
      ) : (
        <Card style={styles.membership}>
          <View style={[styles.noSubRow, { backgroundColor: colors.muted }]}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.mutedForeground} />
            <Text style={[styles.noSubText, { color: colors.mutedForeground }]}>
              No active subscription found. Choose a plan below to join the desk.
            </Text>
          </View>
          <SubscribePanel />
        </Card>
      )}

      {/* Notifications */}
      <SectionLabel>Notifications</SectionLabel>
      <Card style={styles.settingsCard}>
        <SettingRow
          icon="notifications-outline"
          title="Push notifications"
          subtitle="Enable all push alerts"
          value={pushMaster}
          onChange={handlePushMaster}
        />
        <SettingRow
          icon="pulse-outline"
          title="New signals"
          subtitle="When Wick posts a new setup"
          value={notifySignals}
          onChange={handleSignalsToggle}
        />
        <SettingRow
          icon="newspaper-outline"
          title="Major news"
          subtitle="Only market-moving updates"
          value={notifyNews}
          onChange={handleNewsToggle}
        />
      </Card>

      {/* Account */}
      <SectionLabel>Account</SectionLabel>
      <Card style={styles.settingsCard}>
        <Pressable onPress={() => router.push('/settings' as never)} style={styles.accountRow} accessibilityRole="button">
          <Ionicons name="time-outline" size={19} color={colors.accent} />
          <Text style={[styles.accountText, { color: colors.foreground }]}>Timezone</Text>
          <Text style={[styles.accountValue, { color: colors.mutedForeground }]}>{timezoneLabel}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </Pressable>
        <Pressable onPress={() => router.push('/legal' as never)} style={styles.accountRow} accessibilityRole="button">
          <Ionicons name="document-text-outline" size={19} color={colors.accent} />
          <Text style={[styles.accountText, { color: colors.foreground }]}>Legal &amp; disclosures</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
        </Pressable>
        {isAdmin ? (
          <Pressable
            onPress={() => router.push('/admin')}
            style={styles.accountRow}
            accessibilityRole="button"
          >
            <Ionicons name="create-outline" size={19} color={colors.primary} />
            <Text style={[styles.accountText, { color: colors.foreground }]}>Admin signal studio</Text>
            <Tag>ADMIN</Tag>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
        {isAdmin ? (
          <Pressable
            onPress={() => router.push('/admin/users')}
            style={styles.accountRow}
            accessibilityRole="button"
          >
            <Ionicons name="people-outline" size={19} color={colors.primary} />
            <Text style={[styles.accountText, { color: colors.foreground }]}>Manage users</Text>
            <Tag>ADMIN</Tag>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={handleSignOut}
          disabled={signingOut}
          style={[styles.accountRow, { opacity: signingOut ? 0.5 : 1 }]}
          accessibilityRole="button"
        >
          <Ionicons name="log-out-outline" size={19} color={colors.destructive} />
          <Text style={[styles.accountText, { color: colors.destructive }]}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Text>
        </Pressable>
      </Card>

      <Text style={[styles.footer, { color: colors.mutedForeground }]}>WICK BETTS · PRIVATE MARKET INTELLIGENCE</Text>
    </Screen>
  );
}

function SettingRow({
  icon,
  title,
  subtitle,
  value,
  onChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (value: boolean) => void | Promise<void>;
}) {
  const colors = useColors();
  return (
    <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
      <Ionicons name={icon} size={19} color={colors.accent} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[styles.settingTitle, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.settingSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
      </View>
      <Switch
        testID={`toggle-${title}`}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.foreground}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 110 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  largeAvatar: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  largeAvatarText: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  name: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  email: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 3 },
  membership: { marginBottom: 8 },
  membershipTop: { marginBottom: 14 },
  membershipActions: { gap: 10 },
  planName: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  planMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  noSubRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, padding: 12, marginBottom: 12 },
  noSubText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  settingsCard: { marginBottom: 8 },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
  settingTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  settingSubtitle: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  accountRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 12 },
  accountText: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  accountValue: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  footer: { textAlign: 'center', fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, marginTop: 24 },
});
