import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card, Tag } from '@/components/WickUI';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/apiUrl';

interface AdminMentorshipRequest {
  id: string;
  userEmail: string;
  userName: string | null;
  day: string;
  sessionDate: string;
  slot: string;
  status: 'pending' | 'confirmed' | 'declined' | 'cancelled';
  createdAt: string;
}

function formatSessionDate(iso: string): string {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function formatSubmitted(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function AdminMentorshipScreen() {
  const router = useRouter();
  const colors = useColors();
  const { getToken, user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [requests, setRequests] = useState<AdminMentorshipRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/admin/mentorship-requests`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Could not load mentorship requests.');
      const json = (await res.json()) as { requests: AdminMentorshipRequest[] };
      setRequests(json.requests ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load mentorship requests.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (isAdmin) void loadRequests();
  }, [isAdmin, loadRequests]);

  const decide = async (item: AdminMentorshipRequest, status: 'confirmed' | 'declined') => {
    setUpdatingId(item.id);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/admin/mentorship-requests/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to update this request.');
      }
      setRequests((prev) => prev.map((r) => (r.id === item.id ? { ...r, status } : r)));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update this request.');
    } finally {
      setUpdatingId(null);
    }
  };

  const pending = requests.filter((r) => r.status === 'pending');
  const decided = requests.filter((r) => r.status !== 'pending');

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
            <Text style={[styles.title, { color: colors.foreground }]}>Mentorship requests</Text>
          </View>
          <Tag>ADMIN</Tag>
        </View>

        <View style={[styles.notice, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
            {pending.length > 0
              ? `${pending.length} request${pending.length === 1 ? '' : 's'} awaiting a decision. Confirming or declining frees up the slot either way.`
              : 'No pending requests right now.'}
          </Text>
        </View>

        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : requests.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No mentorship requests have been submitted yet.</Text>
          </Card>
        ) : (
          <>
            {pending.map((r) => {
              const busy = updatingId === r.id;
              return (
                <Card key={r.id} style={styles.requestRow}>
                  <View style={styles.requestTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.requestDate, { color: colors.foreground }]}>{formatSessionDate(r.sessionDate)}</Text>
                      <Text style={[styles.requestSlot, { color: colors.mutedForeground }]}>{r.slot} Central</Text>
                    </View>
                    <Tag tone="orange">Pending</Tag>
                  </View>
                  <Text style={[styles.requestMember, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {r.userName ? `${r.userName} · ` : ''}{r.userEmail}
                  </Text>
                  <Text style={[styles.requestSubmitted, { color: colors.mutedForeground }]}>Requested {formatSubmitted(r.createdAt)}</Text>
                  <View style={styles.actionsRow}>
                    <Pressable
                      onPress={() => void decide(r, 'confirmed')}
                      disabled={busy}
                      style={[styles.actionButton, styles.confirmButton, busy && { opacity: 0.5 }]}
                      accessibilityRole="button"
                      testID={`confirm-request-${r.id}`}
                    >
                      {busy ? <ActivityIndicator size="small" color="#08161A" /> : (
                        <>
                          <Ionicons name="checkmark-circle" size={15} color="#08161A" />
                          <Text style={styles.confirmButtonText}>Confirm</Text>
                        </>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => void decide(r, 'declined')}
                      disabled={busy}
                      style={[styles.actionButton, { borderColor: colors.border }, busy && { opacity: 0.5 }]}
                      accessibilityRole="button"
                      testID={`decline-request-${r.id}`}
                    >
                      <Ionicons name="close-circle" size={15} color={colors.destructive} />
                      <Text style={[styles.declineButtonText, { color: colors.destructive }]}>Decline</Text>
                    </Pressable>
                  </View>
                </Card>
              );
            })}

            {decided.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>RECENT DECISIONS</Text>
                {decided.slice(0, 20).map((r) => (
                  <Card key={r.id} style={styles.requestRow}>
                    <View style={styles.requestTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.requestDate, { color: colors.foreground }]}>{formatSessionDate(r.sessionDate)}</Text>
                        <Text style={[styles.requestSlot, { color: colors.mutedForeground }]}>{r.slot} Central</Text>
                      </View>
                      <Tag tone={r.status === 'confirmed' ? 'green' : r.status === 'cancelled' ? 'muted' : 'muted'}>
                        {r.status === 'confirmed' ? 'Confirmed' : r.status === 'cancelled' ? 'Cancelled' : 'Declined'}
                      </Tag>
                    </View>
                    <Text style={[styles.requestMember, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {r.userName ? `${r.userName} · ` : ''}{r.userEmail}
                    </Text>
                  </Card>
                ))}
              </>
            ) : null}
          </>
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
  sectionLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, marginTop: 8, marginBottom: 10 },
  requestRow: { marginBottom: 12 },
  requestTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 6 },
  requestDate: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  requestSlot: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 2 },
  requestMember: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  requestSubmitted: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 4 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 11, paddingVertical: 10 },
  confirmButton: { backgroundColor: '#7AE2AA', borderColor: '#7AE2AA' },
  confirmButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#08161A' },
  declineButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  gateTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', marginTop: 4 },
  gateText: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18 },
  gateButton: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10, marginTop: 6 },
  gateButtonText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});
