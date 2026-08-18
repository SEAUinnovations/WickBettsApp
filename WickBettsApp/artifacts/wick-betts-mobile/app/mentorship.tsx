import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card, Header, PrimaryButton, Screen, SectionLabel, Tag } from '@/components/WickUI';
import { UpgradeMentorshipButton } from '@/components/Billing';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useMentorship, type MentorshipBooking } from '@/hooks/useMentorship';

function formatSessionDate(iso: string): string {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export default function MentorshipScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { days, bookings, loading, booking, error, gateBlocked, requestBooking, cancelBooking } = useMentorship(true);
  const [selected, setSelected] = useState<{ day: string; date: string; slot: string } | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // The server is the source of truth for access (403 MENTORSHIP_REQUIRED
  // unless the member has an active mentorship subscription, or is an
  // admin) — gateBlocked reflects that response directly rather than
  // trusting a client-only plan check that could be stale or spoofed.
  const isLocked = !isAdmin && gateBlocked;

  const weeklyUsed = bookings.length;
  const weeklyLimit = 2;

  const request = async () => {
    if (!selected) return;
    const ok = await requestBooking(selected);
    if (ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelected(null);
      Alert.alert('Request sent', "Your one-hour session request is awaiting confirmation. We'll email you as soon as it's confirmed.");
    } else if (error) {
      Alert.alert('Could not request session', error);
    }
  };

  const cancel = (item: MentorshipBooking) => {
    const label = item.status === 'confirmed' ? 'Cancel this confirmed session?' : 'Withdraw this pending request?';
    const run = async () => {
      setCancellingId(item.id);
      const ok = await cancelBooking(item.id);
      setCancellingId(null);
      if (ok) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else if (error) Alert.alert('Could not cancel', error);
    };
    if (Platform.OS === 'web') {
      if (window.confirm(label)) void run();
      return;
    }
    Alert.alert(label, "This can't be undone.", [
      { text: 'Keep it', style: 'cancel' },
      { text: item.status === 'confirmed' ? 'Cancel session' : 'Withdraw request', style: 'destructive', onPress: () => void run() },
    ]);
  };

  const heroBackRow = (
    <View style={styles.backRow}>
      <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
        <Ionicons name="arrow-back" size={21} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.backTitle, { color: colors.foreground }]}>Mentorship</Text>
      <View style={{ width: 42 }} />
    </View>
  );

  if (loading) {
    return (
      <Screen contentStyle={styles.content}>
        {heroBackRow}
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (isLocked) {
    return (
      <Screen contentStyle={styles.content}>
        {heroBackRow}
        <Card style={styles.lockedPanel}>
          <View style={[styles.lockedIcon, { backgroundColor: colors.secondary }]}>
            <Ionicons name="lock-closed-outline" size={26} color={colors.primary} />
          </View>
          <Text style={[styles.lockedTitle, { color: colors.foreground }]}>A quieter room, reserved for mentorship.</Text>
          <Text style={[styles.lockedBody, { color: colors.mutedForeground }]}>
            Mentorship includes the complete Wick desk plus four one-hour calls per billing cycle. Upgrade your membership to unlock this room.
          </Text>
          <View style={styles.lockedAction}>
            <UpgradeMentorshipButton />
          </View>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.content}>
      {heroBackRow}
      <View style={[styles.hero, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <View style={[styles.heroOrb, { borderColor: colors.primary }]}><View style={[styles.heroOrbInner, { borderColor: colors.accent }]} /></View>
        <Text style={[styles.heroEyebrow, { color: colors.primary }]}>PRIVATE ACCESS</Text>
        <Text style={[styles.heroTitle, { color: colors.foreground }]}>Make the next{'\n'}conversation count.</Text>
        <Text style={[styles.heroBody, { color: colors.mutedForeground }]}>Request an open one-hour session below. An admin confirms every request before it's on the calendar.</Text>
      </View>
      <Card style={styles.usageCard}>
        <View style={styles.usageTop}>
          <View>
            <Text style={[styles.usageLabel, { color: colors.mutedForeground }]}>WEEKLY USAGE</Text>
            <Text style={[styles.usageValue, { color: colors.foreground }]}>{Math.min(weeklyUsed, weeklyLimit)} of {weeklyLimit} used</Text>
          </View>
          <Tag tone="purple">Resets Monday</Tag>
        </View>
        <View style={[styles.usageTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.usageFill, { backgroundColor: colors.primary, width: `${Math.min(100, (weeklyUsed / weeklyLimit) * 100)}%` }]} />
        </View>
        <Text style={[styles.usageText, { color: colors.mutedForeground }]}>Your next allowance begins Monday.</Text>
      </Card>

      {bookings.length > 0 ? (
        <>
          <SectionLabel>Your requests</SectionLabel>
          {bookings.map((b) => {
            const isPending = b.status === 'pending';
            return (
              <Card key={b.id} style={styles.requestCard}>
                <View style={styles.requestTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.requestDate, { color: colors.foreground }]}>{formatSessionDate(b.sessionDate)}</Text>
                    <Text style={[styles.requestSlot, { color: colors.mutedForeground }]}>{b.slot} Central</Text>
                  </View>
                  <Tag tone={isPending ? 'orange' : 'green'}>{isPending ? 'Pending' : 'Confirmed'}</Tag>
                </View>
                <Text style={[styles.requestNote, { color: colors.mutedForeground }]}>
                  {isPending ? 'Awaiting admin confirmation — this time is held for you in the meantime.' : "You're on the calendar for this one."}
                </Text>
                <Pressable
                  onPress={() => cancel(b)}
                  disabled={cancellingId === b.id}
                  style={[styles.cancelChip, { borderColor: colors.border }, cancellingId === b.id && { opacity: 0.5 }]}
                  accessibilityRole="button"
                  testID={`cancel-request-${b.id}`}
                >
                  {cancellingId === b.id ? (
                    <ActivityIndicator size="small" color={colors.destructive} />
                  ) : (
                    <>
                      <Ionicons name="close-circle" size={14} color={colors.destructive} />
                      <Text style={[styles.cancelChipText, { color: colors.destructive }]}>{isPending ? 'Withdraw request' : 'Cancel session'}</Text>
                    </>
                  )}
                </Pressable>
              </Card>
            );
          })}
        </>
      ) : null}

      <SectionLabel>Available sessions</SectionLabel>
      {days.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={22} color={colors.primary} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No open times right now</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Every upcoming slot is currently requested or confirmed. Check back soon as the calendar clears.</Text>
        </Card>
      ) : (
        days.map((day) => (
          <View key={day.day + day.date} style={styles.dayRow}>
            <View style={styles.dateBlock}>
              <Text style={[styles.day, { color: colors.mutedForeground }]}>{day.day}</Text>
              <Text style={[styles.date, { color: colors.foreground }]}>{day.dateLabel}</Text>
            </View>
            <View style={styles.slots}>
              {day.slots.map((slot) => {
                const id = `${day.day}-${day.date}-${slot}`;
                const isSelected = selected && `${selected.day}-${selected.date}-${selected.slot}` === id;
                return (
                  <Pressable
                    key={slot}
                    disabled={booking}
                    onPress={() => setSelected({ day: day.day, date: day.date, slot })}
                    style={[styles.slot, { backgroundColor: isSelected ? colors.primary : colors.card, borderColor: isSelected ? colors.primary : colors.border }]}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.slotText, { color: isSelected ? colors.primaryForeground : colors.foreground }]}>{slot}</Text>
                    <Ionicons name={isSelected ? 'checkmark-circle' : 'time-outline'} size={15} color={isSelected ? colors.primaryForeground : colors.mutedForeground} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))
      )}
      {booking ? (
        <View style={[styles.busyButton, { backgroundColor: colors.primary }]}>
          <ActivityIndicator color={colors.primaryForeground} />
        </View>
      ) : (
        <View pointerEvents={selected ? 'auto' : 'none'} style={!selected ? styles.disabled : undefined}>
          <PrimaryButton onPress={() => void request()} icon="calendar-outline" testID="confirm-booking">
            Request one-hour session
          </PrimaryButton>
        </View>
      )}
      {error ? <Text style={[styles.footnote, { color: colors.destructive }]}>{error}</Text> : null}
      <Text style={[styles.footnote, { color: colors.mutedForeground }]}>Every request needs an admin's confirmation before it's an actual scheduled call. You can withdraw a pending request or cancel a confirmed one anytime above.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 110 },
  backRow: { minHeight: 74, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  backTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  loadingWrap: { paddingVertical: 60, alignItems: 'center' },
  hero: { borderWidth: 1, borderRadius: 22, overflow: 'hidden', minHeight: 218, padding: 20, justifyContent: 'center', position: 'relative', marginBottom: 16 },
  heroEyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.6, marginBottom: 12 },
  heroTitle: { fontSize: 29, lineHeight: 34, fontFamily: 'Inter_700Bold', letterSpacing: -0.8 },
  heroBody: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', maxWidth: 260, marginTop: 12 },
  heroOrb: { position: 'absolute', width: 190, height: 190, borderRadius: 95, borderWidth: 1, right: -56, top: 22 },
  heroOrbInner: { position: 'absolute', width: 115, height: 115, borderRadius: 58, borderWidth: 1, top: 37, left: 37 },
  usageCard: { marginBottom: 25 },
  usageTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  usageLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  usageValue: { fontSize: 18, fontFamily: 'Inter_700Bold', marginTop: 5 },
  usageTrack: { height: 6, borderRadius: 3, marginTop: 16, overflow: 'hidden' },
  usageFill: { height: 6, borderRadius: 3 },
  usageText: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 9 },
  requestCard: { marginBottom: 12 },
  requestTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  requestDate: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  requestSlot: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 2 },
  requestNote: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 10 },
  cancelChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start', marginTop: 12 },
  cancelChipText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  emptyCard: { alignItems: 'center', paddingVertical: 28, marginBottom: 14 },
  emptyTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', marginTop: 10 },
  emptyText: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 5, paddingHorizontal: 12 },
  dayRow: { flexDirection: 'row', marginBottom: 14 },
  dateBlock: { width: 48, paddingTop: 10 },
  day: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  date: { fontSize: 25, fontFamily: 'Inter_700Bold', marginTop: 2 },
  slots: { flex: 1, gap: 8 },
  slot: { minHeight: 45, paddingHorizontal: 14, borderWidth: 1, borderRadius: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  slotText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  footnote: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 14, paddingHorizontal: 12 },
  lockedPanel: { alignItems: 'center', gap: 14, paddingVertical: 30, marginTop: 8 },
  lockedIcon: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  lockedTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', textAlign: 'center', letterSpacing: -0.4, paddingHorizontal: 8 },
  lockedBody: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 8, marginBottom: 4 },
  lockedAction: { alignSelf: 'stretch' },
  busyButton: { minHeight: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
});
