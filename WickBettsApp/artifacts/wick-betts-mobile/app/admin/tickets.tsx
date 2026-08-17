import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card, Tag } from '@/components/WickUI';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/apiUrl';

interface AdminTicket {
  id: string;
  userEmail: string;
  subject: string;
  message: string;
  status: 'open' | 'resolved';
  emailSentAt: string | null;
  createdAt: string;
}

export default function AdminTicketsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { getToken, user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/admin/tickets`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Could not load support tickets.');
      const json = (await res.json()) as { tickets: AdminTicket[] };
      setTickets(json.tickets ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load support tickets.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (isAdmin) void loadTickets();
  }, [isAdmin, loadTickets]);

  const toggleStatus = async (target: AdminTicket) => {
    const nextStatus = target.status === 'open' ? 'resolved' : 'open';
    setUpdatingId(target.id);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/admin/tickets/${target.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to update ticket.');
      }
      setTickets((prev) => prev.map((t) => (t.id === target.id ? { ...t, status: nextStatus } : t)));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update ticket.');
    } finally {
      setUpdatingId(null);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  const openCount = tickets.filter((t) => t.status === 'open').length;

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
            <Text style={[styles.title, { color: colors.foreground }]}>Support tickets</Text>
          </View>
          <Tag>ADMIN</Tag>
        </View>

        <View style={[styles.notice, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Ionicons name="chatbox-ellipses-outline" size={18} color={colors.primary} />
          <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
            {openCount > 0
              ? `${openCount} open ticket${openCount === 1 ? '' : 's'}. Every submission is also emailed to seauinnovations@gmail.com.`
              : 'No open tickets. Every submission is also emailed to seauinnovations@gmail.com.'}
          </Text>
        </View>

        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : tickets.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No tickets have been submitted yet.</Text>
          </Card>
        ) : (
          tickets.map((t) => {
            const busy = updatingId === t.id;
            const resolved = t.status === 'resolved';
            return (
              <Card key={t.id} style={styles.ticketRow}>
                <View style={styles.ticketTop}>
                  <Text style={[styles.ticketSubject, { color: colors.foreground }]} numberOfLines={2}>{t.subject}</Text>
                  <Tag tone={resolved ? 'green' : 'orange'}>{resolved ? 'Resolved' : 'Open'}</Tag>
                </View>
                <Text style={[styles.ticketEmail, { color: colors.mutedForeground }]} numberOfLines={1}>{t.userEmail}</Text>
                <Text style={[styles.ticketMessage, { color: colors.foreground }]}>{t.message}</Text>
                <View style={[styles.metaRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.ticketDate, { color: colors.mutedForeground }]}>Submitted {formatDate(t.createdAt)}</Text>
                  {!t.emailSentAt ? (
                    <View style={styles.emailWarning}>
                      <Ionicons name="alert-circle-outline" size={12} color="#FDBA74" />
                      <Text style={styles.emailWarningText}>Email not sent</Text>
                    </View>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => void toggleStatus(t)}
                  disabled={busy}
                  style={[styles.actionButton, { borderColor: colors.border }, busy && { opacity: 0.5 }]}
                  accessibilityRole="button"
                  testID={`toggle-ticket-${t.id}`}
                >
                  <Ionicons
                    name={resolved ? 'refresh-outline' : 'checkmark-done-outline'}
                    size={15}
                    color={resolved ? colors.mutedForeground : '#7AE2AA'}
                  />
                  <Text style={[styles.actionButtonText, { color: resolved ? colors.mutedForeground : '#7AE2AA' }]}>
                    {busy ? 'Saving…' : resolved ? 'Reopen' : 'Mark resolved'}
                  </Text>
                </Pressable>
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
  ticketRow: { marginBottom: 12 },
  ticketTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 6 },
  ticketSubject: { flex: 1, fontSize: 14, fontFamily: 'Inter_700Bold' },
  ticketEmail: { fontSize: 11, fontFamily: 'Inter_500Medium', marginBottom: 8 },
  ticketMessage: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', marginBottom: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 10, marginBottom: 12 },
  ticketDate: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  emailWarning: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  emailWarningText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: '#FDBA74' },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 9, alignSelf: 'flex-start' },
  actionButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  gateTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', marginTop: 4 },
  gateText: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18 },
  gateButton: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10, marginTop: 6 },
  gateButtonText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});
