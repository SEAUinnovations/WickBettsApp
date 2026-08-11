import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card, Header, PrimaryButton, Screen, SectionLabel, Tag } from '@/components/WickUI';
import { UpgradeMentorshipButton } from '@/components/Billing';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';

const days = [
  { day: 'MON', date: '17', slots: ['10:00 AM', '2:00 PM'] },
  { day: 'TUE', date: '18', slots: ['11:00 AM', '3:00 PM'] },
  { day: 'WED', date: '19', slots: ['9:00 AM'] },
];

export default function MentorshipScreen() {
  const router = useRouter();
  const colors = useColors();
  const { subscription } = useAuth();
  const isMentorship = subscription?.plan === 'mentorship';
  const [selected, setSelected] = useState('MON-10:00 AM');
  const [booked, setBooked] = useState(false);
  const book = () => {
    setBooked(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Session confirmed', 'Your one-hour mentorship session is on the calendar.');
  };

  if (!isMentorship) {
    return (
      <Screen contentStyle={styles.content}>
        <View style={styles.backRow}><Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button"><Ionicons name="arrow-back" size={21} color={colors.foreground} /></Pressable><Text style={[styles.backTitle, { color: colors.foreground }]}>Mentorship</Text><View style={{ width: 42 }} /></View>
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
      <View style={styles.backRow}><Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button"><Ionicons name="arrow-back" size={21} color={colors.foreground} /></Pressable><Text style={[styles.backTitle, { color: colors.foreground }]}>Mentorship</Text><View style={{ width: 42 }} /></View>
      <View style={[styles.hero, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <View style={[styles.heroOrb, { borderColor: colors.primary }]}><View style={[styles.heroOrbInner, { borderColor: colors.accent }]} /></View>
        <Text style={[styles.heroEyebrow, { color: colors.primary }]}>PRIVATE ACCESS</Text>
        <Text style={[styles.heroTitle, { color: colors.foreground }]}>Make the next{'\n'}conversation count.</Text>
        <Text style={[styles.heroBody, { color: colors.mutedForeground }]}>Choose an available one-hour session. You have two sessions included every week.</Text>
      </View>
      <Card style={styles.usageCard}>
        <View style={styles.usageTop}><View><Text style={[styles.usageLabel, { color: colors.mutedForeground }]}>WEEKLY USAGE</Text><Text style={[styles.usageValue, { color: colors.foreground }]}>2 of 2 used</Text></View><Tag tone="purple">Resets Monday</Tag></View>
        <View style={[styles.usageTrack, { backgroundColor: colors.border }]}><View style={[styles.usageFill, { backgroundColor: colors.primary }]} /></View>
        <Text style={[styles.usageText, { color: colors.mutedForeground }]}>Your next allowance begins Monday, August 24.</Text>
      </Card>
      <SectionLabel>Available sessions</SectionLabel>
      {days.map((day) => (
        <View key={day.day} style={styles.dayRow}>
          <View style={styles.dateBlock}><Text style={[styles.day, { color: colors.mutedForeground }]}>{day.day}</Text><Text style={[styles.date, { color: colors.foreground }]}>{day.date}</Text></View>
          <View style={styles.slots}>{day.slots.map((slot) => {
            const id = `${day.day}-${slot}`;
            const isSelected = selected === id;
            return <Pressable key={slot} disabled={booked} onPress={() => setSelected(id)} style={[styles.slot, { backgroundColor: isSelected ? colors.primary : colors.card, borderColor: isSelected ? colors.primary : colors.border }]} accessibilityRole="button"><Text style={[styles.slotText, { color: isSelected ? colors.primaryForeground : colors.foreground }]}>{slot}</Text><Ionicons name={isSelected ? 'checkmark-circle' : 'time-outline'} size={15} color={isSelected ? colors.primaryForeground : colors.mutedForeground} /></Pressable>;
          })}</View>
        </View>
      ))}
      <PrimaryButton onPress={book} icon={booked ? 'checkmark' : 'calendar-outline'} testID="confirm-booking">{booked ? 'Session booked' : 'Confirm one-hour session'}</PrimaryButton>
      <Text style={[styles.footnote, { color: colors.mutedForeground }]}>Need to make a change? Sessions can be rescheduled up to 24 hours before start time.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 110 },
  backRow: { minHeight: 74, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  backTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
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
  usageFill: { height: 6, width: '100%', borderRadius: 3 },
  usageText: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 9 },
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
});