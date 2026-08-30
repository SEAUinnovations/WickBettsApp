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
        <Text style={[styles.body, { color: colors.foreground }]}>Wick Betts is educational market intelligence. It is not investment advice, and nothing here should be treated as a recommendation to buy or sell any security, option, future, or digital asset.</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>Trading and investing carry a substantial risk of loss and are not suitable for every person. Past performance of any setup, signal, or strategy shown in this app is not indicative of future results. You are solely responsible for your own trading decisions — consult a licensed financial advisor before acting on anything in this app.</Text>
      </Card>

      <SectionLabel>Referral program</SectionLabel>
      <Card style={styles.card}>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          Share your referral link or code with a friend. When they sign up for their first Wick Betts subscription — any plan — using it, you receive a $5 credit automatically applied toward your next charge, whatever plan you're on. Credit has no cash value, cannot be redeemed for cash, and cannot be transferred to another account.
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          Only a person's first-ever Wick Betts subscription counts as a referral. Referring yourself, using a second account you control, or any other attempt to manufacture referrals voids the reward and may result in account termination. Credit already issued for a referral is reversed if the referred subscription's payment is later refunded or disputed.
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          After your first 10 rewarded referrals, you become a Wick Betts Ambassador: instead of further $5 credits, you receive 50% off Membership for as long as you remain subscribed to it — this status, once granted, does not expire or get revoked.
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          If you share your referral link publicly (social media, forums, or similar), please disclose that you receive a reward for signups made through it. We may modify or end this program at any time; credit already earned before a change is honored.
        </Text>
      </Card>

      <SectionLabel>Billing, refunds &amp; disputes</SectionLabel>
      <Card style={styles.card}>
        <Text style={[styles.bodyBold, { color: colors.foreground }]}>All sales are final. No refunds.</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          All subscription charges and one-time purchases (including but not limited to Signals, Mentorship, Membership plans, and Trade Review credits) are final and non-refundable, in full or in part, for any reason — including partial billing periods, unused access, or dissatisfaction with content — except where a refund is strictly required by applicable law.
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          You may cancel your subscription at any time from Profile → Manage billing to stop future renewal charges. Cancelling stops the next billing cycle only — it does not refund the current or any prior billing period, and you retain access through the end of the period you already paid for.
        </Text>
        <Text style={[styles.bodyBold, { color: colors.foreground }]}>Billing disputes.</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          If you believe you were charged in error, contact support before contacting your bank or card issuer — most billing questions can be resolved directly and faster that way. We reserve the right to review and respond to any dispute or chargeback with our full transaction, access, and usage records.
        </Text>
        <Text style={[styles.bodyBold, { color: colors.foreground }]}>Fraud &amp; chargeback abuse.</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          Filing a chargeback or payment dispute for a charge you authorized, after receiving the service you paid for, is treated as fraud and payment abuse. Accounts found to have engaged in fraudulent signups, stolen or unauthorized payment methods, or chargeback abuse will be terminated immediately without refund, permanently barred from future access, and may be reported to the payment processor and, where appropriate, law enforcement.
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          This policy is provided for transparency and does not constitute legal advice; it is governed by the full Terms of Service on our website, which controls in the event of any conflict.
        </Text>
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
  bodyBold: { fontSize: 13, fontFamily: 'Inter_700Bold', lineHeight: 20, marginBottom: 4 },
  stack: { gap: 10, marginTop: 8 },
});