import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Header, PrimaryButton, Screen, SectionLabel } from '@/components/WickUI';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { API_BASE } from '@/lib/apiUrl';

const TIMEZONES = [
  { label: 'New York (ET)', value: 'America/New_York' },
  { label: 'Chicago (CT)', value: 'America/Chicago' },
  { label: 'Denver (MT)', value: 'America/Denver' },
  { label: 'Los Angeles (PT)', value: 'America/Los_Angeles' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user, getToken, refreshSubscription } = useAuth();
  const [savingTimezone, setSavingTimezone] = useState<string | null>(null);
  const [error, setError] = useState('');

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

  return (
    <Screen contentStyle={styles.content}>
      <Header eyebrow="Wick Betts / Account" title="Settings" onAction={() => router.back()} />

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
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Purchases open Stripe Checkout in your browser for secure payment handling.</Text>
        <PrimaryButton onPress={() => router.push('/legal' as never)} icon="document-text-outline">Read legal disclosures</PrimaryButton>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 108 },
  card: { marginBottom: 8 },
  subtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18, marginBottom: 14 },
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