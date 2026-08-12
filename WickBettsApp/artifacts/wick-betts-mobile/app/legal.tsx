import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Header, PrimaryButton, Screen, SectionLabel } from '@/components/WickUI';
import { useColors } from '@/hooks/useColors';

export default function LegalScreen() {
  const router = useRouter();
  const colors = useColors();

  return (
    <Screen contentStyle={styles.content}>
      <Header eyebrow="Wick Betts / Account" title="Legal" onAction={() => router.back()} />

      <SectionLabel>Disclosures</SectionLabel>
      <Card style={styles.card}>
        <Text style={[styles.body, { color: colors.foreground }]}>Wick Betts is educational market intelligence. It is not investment advice, and nothing here should be treated as a recommendation to buy or sell any security.</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>If you need help with your subscription or account, use the billing portal or contact support from the main site.</Text>
        <View style={styles.stack}>
          <PrimaryButton onPress={() => void Linking.openURL('https://wickbetts.com')} icon="open-outline">Open website</PrimaryButton>
          <PrimaryButton onPress={() => void Linking.openURL('mailto:support@wickbetts.com')} icon="mail-outline">Email support</PrimaryButton>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 108 },
  card: { marginBottom: 8 },
  body: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20, marginBottom: 12 },
  stack: { gap: 10, marginTop: 8 },
});