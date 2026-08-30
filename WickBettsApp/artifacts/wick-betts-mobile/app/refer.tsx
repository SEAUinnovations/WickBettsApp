import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Divider, Header, Metric, PrimaryButton, Screen, SectionLabel, Tag } from '@/components/WickUI';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/apiUrl';

interface ReferralInfo {
  code: string;
  link: string;
  tier: 'standard' | 'ambassador';
  rewardedCount: number;
  successfulReferralCount: number;
  cap: number;
  remainingSlots: number;
  creditsEarnedCents: number;
  pendingCount: number;
  rewardPerReferralCents: number;
}

async function fetchReferralInfo(token: string): Promise<ReferralInfo | null> {
  try {
    const res = await fetch(`${API_BASE}/referrals/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as ReferralInfo;
  } catch {
    return null;
  }
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export default function ReferScreen() {
  const router = useRouter();
  const colors = useColors();
  const { getToken } = useAuth();

  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      if (!token) {
        setError('Please sign in again to view your referral info.');
        return;
      }
      const data = await fetchReferralInfo(token);
      if (!data) {
        setError('Could not load your referral info. Pull to refresh or try again shortly.');
        return;
      }
      setInfo(data);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleShare = useCallback(async () => {
    if (!info) return;
    setSharing(true);
    try {
      await Share.share({
        message: `Join me on Wick Betts and I'll both get rewarded — sign up for any plan with my link: ${info.link}`,
        url: info.link,
      });
    } catch {
      // User dismissed the share sheet — nothing to do.
    } finally {
      setSharing(false);
    }
  }, [info]);

  const isAmbassador = info?.tier === 'ambassador';

  return (
    <Screen>
      <Header eyebrow="Wick Betts / Account" title="Refer &amp; earn" onAction={() => router.back()} />

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <Card>
          <Text style={[styles.body, { color: colors.destructive }]}>{error}</Text>
          <View style={styles.retryButton}>
            <PrimaryButton onPress={() => void load()} icon="refresh-outline">Try again</PrimaryButton>
          </View>
        </Card>
      ) : info ? (
        <>
          <SectionLabel>How it works</SectionLabel>
          <Card style={styles.card}>
            <Text style={[styles.body, { color: colors.foreground }]}>
              Share your link. When someone signs up for any Wick Betts subscription with it, you get{' '}
              {formatCents(info.rewardPerReferralCents)} credited toward your next charge — automatically, no matter what plan you're on.
            </Text>
            <Text style={[styles.bodyMuted, { color: colors.mutedForeground }]}>
              After your first {info.cap} rewarded referrals ({formatCents(info.cap * info.rewardPerReferralCents)}
              {' '}total), every referral after that unlocks something bigger: 50% off Membership, for life.
            </Text>
          </Card>

          {isAmbassador ? (
            <Card style={styles.card}>
              <View style={styles.ambassadorRow}>
                <Tag tone="green">AMBASSADOR</Tag>
              </View>
              <Text style={[styles.body, { color: colors.foreground, marginTop: 10 }]}>
                You've unlocked lifetime 50% off Membership. If you're not on Membership yet, switch anytime from Profile — the discount is already applied to your account.
              </Text>
            </Card>
          ) : (
            <>
              <SectionLabel>Your progress</SectionLabel>
              <Card style={styles.card}>
                <View style={styles.metricsRow}>
                  <Metric label="Rewarded" value={`${info.rewardedCount} / ${info.cap}`} />
                  <Metric label="Credited so far" value={formatCents(info.creditsEarnedCents)} color={colors.accent} />
                  {info.pendingCount > 0 ? (
                    <Metric label="Pending" value={String(info.pendingCount)} detail="processing" />
                  ) : null}
                </View>
                {info.remainingSlots > 0 ? (
                  <Text style={[styles.bodyMuted, { color: colors.mutedForeground, marginTop: 10 }]}>
                    {info.remainingSlots} more referral{info.remainingSlots === 1 ? '' : 's'} to Ambassador status.
                  </Text>
                ) : null}
              </Card>
            </>
          )}

          <SectionLabel>Your link</SectionLabel>
          <Card style={styles.card}>
            <Text selectable style={[styles.link, { color: colors.accent }]}>{info.link}</Text>
            <Divider />
            <PrimaryButton onPress={() => void handleShare()} icon="share-outline" testID="share-referral-link">
              {sharing ? 'Opening share sheet…' : 'Share my link'}
            </PrimaryButton>
          </Card>

          <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
            Credit has no cash value and can't be transferred or redeemed for cash. New paid subscribers only — see Legal for full referral program terms.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 60, alignItems: 'center' },
  card: { marginBottom: 8, gap: 4 },
  body: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  bodyMuted: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  metricsRow: { flexDirection: 'row', gap: 16 },
  ambassadorRow: { flexDirection: 'row' },
  link: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 12 },
  retryButton: { marginTop: 12 },
  disclaimer: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular', marginTop: 8, marginBottom: 24 },
});
