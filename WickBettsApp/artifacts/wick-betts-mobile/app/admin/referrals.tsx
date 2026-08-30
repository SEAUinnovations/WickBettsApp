import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card, Tag } from '@/components/WickUI';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/apiUrl';

type ReferralStatus = 'pending' | 'converted' | 'rewarded' | 'clawed_back' | 'blocked';

interface AdminReferral {
  id: string;
  status: ReferralStatus;
  rewardAmountCents: number;
  fraudFlag: boolean;
  createdAt: string;
  convertedAt: string | null;
  rewardEligibleAt: string | null;
  rewardedAt: string | null;
  clawedBackAt: string | null;
  referrer: { id: string; email: string; name: string } | null;
  referredUser: { id: string; email: string; name: string } | null;
}

const STATUS_TONE: Record<ReferralStatus, 'purple' | 'green' | 'orange' | 'muted'> = {
  pending: 'orange',
  converted: 'purple',
  rewarded: 'green',
  clawed_back: 'muted',
  blocked: 'muted',
};

const STATUS_LABEL: Record<ReferralStatus, string> = {
  pending: 'Held for review',
  converted: 'Converted',
  rewarded: 'Rewarded',
  clawed_back: 'Clawed back',
  blocked: 'Blocked',
};

export default function AdminReferralsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { getToken, user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [referrals, setReferrals] = useState<AdminReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadReferrals = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/admin/referrals`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Could not load referrals.');
      const json = (await res.json()) as { referrals: AdminReferral[] };
      setReferrals(json.referrals ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load referrals.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (isAdmin) void loadReferrals();
  }, [isAdmin, loadReferrals]);

  const decide = async (target: AdminReferral, action: 'approve' | 'block') => {
    setUpdatingId(target.id);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/admin/referrals/${target.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to update referral.');
      }
      const json = (await res.json()) as { status: ReferralStatus };
      setReferrals((prev) => prev.map((r) => (r.id === target.id ? { ...r, status: json.status, fraudFlag: false } : r)));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update referral.');
    } finally {
      setUpdatingId(null);
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const heldForReview = referrals.filter((r) => r.status === 'pending').length;

  if (!isAdmin) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={styles.gate}>
          <Ionicons name="shield-outline" size={30} color={colors.mutedForeground} />
          <Text style={[styles.gateTitle, { color: colors.foreground }]}>Admin only</Text>
          <Text style={[styles.gateText, { color: colors.mutedForeground }]}>This room is not accessible to members.</Text>
          <Pressable onPress={() => router.back()} style={[styles.gateButton, { borderColor: colors.border }]} accessibilityRole="button">
            <Text style={[styles.gateButtonText, { color: colors.primary }]}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
            <Ionicons name="arrow-back" size={21} color={colors.foreground} />
          </Pressable>
          <View>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>WICK BETTS / ADMIN</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Referral queue</Text>
          </View>
          <Tag>ADMIN</Tag>
        </View>

        <View style={[styles.notice, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
          <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
            {heldForReview > 0
              ? `${heldForReview} referral${heldForReview === 1 ? '' : 's'} held for review — the referrer exceeded the daily new-referral limit. Approve to let it continue toward a reward, or block it.`
              : 'Nothing held for review right now. Referrals only land here if a referrer exceeds the daily new-referral limit.'}
          </Text>
        </View>

        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : referrals.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No referrals yet.</Text>
          </Card>
        ) : (
          referrals.map((r) => {
            const busy = updatingId === r.id;
            const needsReview = r.status === 'pending';
            return (
              <Card key={r.id} style={styles.row}>
                <View style={styles.rowTop}>
                  <Text style={[styles.referrer, { color: colors.foreground }]} numberOfLines={1}>
                    {r.referrer?.name ?? r.referrer?.email ?? 'Unknown'} → {r.referredUser?.name ?? r.referredUser?.email ?? 'Unknown'}
                  </Text>
                  <Tag tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Tag>
                </View>
                <Text style={[styles.detail, { color: colors.mutedForeground }]}>
                  {r.referrer?.email} referred {r.referredUser?.email}
                </Text>
                <View style={[styles.metaRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                    {formatCents(r.rewardAmountCents)} · created {formatDate(r.createdAt)}
                  </Text>
                  {r.rewardedAt ? (
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Rewarded {formatDate(r.rewardedAt)}</Text>
                  ) : r.rewardEligibleAt ? (
                    <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Eligible {formatDate(r.rewardEligibleAt)}</Text>
                  ) : null}
                </View>
                {needsReview ? (
                  <View style={styles.actionsRow}>
                    <Pressable
                      onPress={() => void decide(r, 'approve')}
                      disabled={busy}
                      style={[styles.actionButton, { borderColor: colors.border }, busy && { opacity: 0.5 }]}
                      accessibilityRole="button"
                      testID={`approve-referral-${r.id}`}
                    >
                      <Ionicons name="checkmark-done-outline" size={15} color="#7AE2AA" />
                      <Text style={[styles.actionButtonText, { color: '#7AE2AA' }]}>{busy ? 'Saving…' : 'Approve'}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void decide(r, 'block')}
                      disabled={busy}
                      style={[styles.actionButton, { borderColor: colors.border }, busy && { opacity: 0.5 }]}
                      accessibilityRole="button"
                      testID={`block-referral-${r.id}`}
                    >
                      <Ionicons name="close-circle-outline" size={15} color={colors.destructive} />
                      <Text style={[styles.actionButtonText, { color: colors.destructive }]}>{busy ? 'Saving…' : 'Block'}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </Card>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, paddingTop: 25, paddingBottom: 50 },
  topBar: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, marginBottom: 6 },
  title: { fontSize: 27, fontFamily: 'Inter_700Bold', letterSpacing: -0.7 },
  notice: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 16 },
  noticeText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  error: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 12, lineHeight: 17 },
  emptyCard: { marginBottom: 8 },
  emptyText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  row: { marginBottom: 12 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 6 },
  referrer: { flex: 1, fontSize: 13, fontFamily: 'Inter_700Bold' },
  detail: { fontSize: 11, fontFamily: 'Inter_400Regular', marginBottom: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 10, marginBottom: 4 },
  metaText: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 9 },
  actionButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  gateTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', marginTop: 4 },
  gateText: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18 },
  gateButton: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10, marginTop: 6 },
  gateButtonText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});
