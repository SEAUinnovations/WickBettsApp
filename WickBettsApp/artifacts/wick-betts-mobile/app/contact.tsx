import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Header, PrimaryButton, Screen, SectionLabel, Tag } from '@/components/WickUI';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/apiUrl';

/**
 * "Contact us" — for technical difficulties with the app/website only (not a
 * general feedback or trading-advice channel; the copy below says so
 * explicitly so tickets stay on-topic for whoever triages them).
 *
 * Every submission is (a) emailed to seauinnovations@gmail.com and (b) saved
 * to the support_tickets table so it also shows up in the admin Support
 * tickets panel even if the email never arrives. See routes/support.ts.
 */

interface Ticket {
  id: string;
  subject: string;
  message: string;
  status: 'open' | 'resolved';
  createdAt: string;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        multiline={multiline}
        style={[
          styles.input,
          multiline && styles.textArea,
          { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border },
        ]}
      />
    </View>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function ContactScreen() {
  const colors = useColors();
  const { getToken } = useAuth();

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [justSubmitted, setJustSubmitted] = useState(false);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/support/tickets`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const json = (await res.json()) as { tickets: Ticket[] };
      setTickets(json.tickets ?? []);
    } catch {
      // Silently degrade — the form itself still works without history.
    } finally {
      setLoadingTickets(false);
    }
  }, [getToken]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const submit = async () => {
    if (submitting) return;
    setError('');
    setJustSubmitted(false);
    if (!subject.trim() || !message.trim()) {
      setError('Please fill in both a subject and a description of the issue.');
      return;
    }
    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/support/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim() }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Could not submit your ticket. Please try again.');
      }
      setSubject('');
      setMessage('');
      setJustSubmitted(true);
      void loadTickets();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit your ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen contentStyle={styles.content}>
      <Header eyebrow="Wick Betts / Account" title="Contact us" />

      <View style={[styles.notice, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Ionicons name="build-outline" size={18} color={colors.primary} />
        <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
          This form is for technical difficulties only — app bugs, login problems, billing or checkout issues, broken pages. We'll follow up at the email on your account.
        </Text>
      </View>

      <SectionLabel>Report an issue</SectionLabel>
      <Card style={styles.formCard}>
        <Field label="Subject" value={subject} onChangeText={setSubject} placeholder="e.g. Signals tab won't load" />
        <Field
          label="What's happening?"
          value={message}
          onChangeText={setMessage}
          placeholder="Tell us what you were doing, what you expected, and what went wrong. Screenshots help if you can describe what's in them."
          multiline
        />
        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        {justSubmitted ? (
          <View style={styles.successRow}>
            <Ionicons name="checkmark-circle" size={16} color="#7AE2AA" />
            <Text style={styles.successText}>Ticket submitted — we'll be in touch.</Text>
          </View>
        ) : null}
        <View style={{ marginTop: 4 }}>
          {submitting ? (
            <View style={[styles.busyButton, { backgroundColor: colors.primary }]}>
              <ActivityIndicator color={colors.primaryForeground} />
            </View>
          ) : (
            <PrimaryButton onPress={() => void submit()} icon="paper-plane-outline" testID="submit-ticket">
              Submit ticket
            </PrimaryButton>
          )}
        </View>
      </Card>

      <SectionLabel>Your tickets</SectionLabel>
      {loadingTickets ? (
        <ActivityIndicator style={{ marginTop: 12 }} color={colors.primary} />
      ) : tickets.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No tickets submitted yet.</Text>
        </Card>
      ) : (
        tickets.map((t) => (
          <Card key={t.id} style={styles.ticketCard}>
            <View style={styles.ticketTop}>
              <Text style={[styles.ticketSubject, { color: colors.foreground }]} numberOfLines={1}>{t.subject}</Text>
              <Tag tone={t.status === 'resolved' ? 'green' : 'orange'}>{t.status === 'resolved' ? 'Resolved' : 'Open'}</Tag>
            </View>
            <Text style={[styles.ticketMessage, { color: colors.mutedForeground }]} numberOfLines={3}>{t.message}</Text>
            <Text style={[styles.ticketDate, { color: colors.mutedForeground }]}>Submitted {formatDate(t.createdAt)}</Text>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 108 },
  notice: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 20 },
  noticeText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  formCard: { marginBottom: 8 },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Inter_400Regular' },
  textArea: { minHeight: 110, textAlignVertical: 'top' },
  error: { fontSize: 12, fontFamily: 'Inter_600SemiBold', lineHeight: 17, marginBottom: 8 },
  successRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  successText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#7AE2AA' },
  busyButton: { minHeight: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  emptyCard: { marginBottom: 8 },
  emptyText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  ticketCard: { marginBottom: 10 },
  ticketTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 },
  ticketSubject: { flex: 1, fontSize: 13, fontFamily: 'Inter_700Bold' },
  ticketMessage: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular', marginBottom: 8 },
  ticketDate: { fontSize: 10, fontFamily: 'Inter_500Medium' },
});
