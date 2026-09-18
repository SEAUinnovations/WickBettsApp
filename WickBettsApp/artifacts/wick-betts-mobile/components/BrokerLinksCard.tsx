import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, SectionLabel } from '@/components/WickUI';
import { useColors } from '@/hooks/useColors';
import { TickerIcon } from '@/components/TickerIcon';
import { brokerLogoUrl } from '@/lib/brokerLogos';
import { BROKER_LINKS, brokerCategoriesForSpecialization, type BrokerCategory, type Specialization } from '@/lib/learningData';

const CATEGORY_LABEL: Record<BrokerCategory, string> = {
  'stocks-options': 'Stocks & options',
  crypto: 'Crypto',
  forex: 'Forex',
  funded: 'Funded futures accounts',
};

/**
 * Shown at the end of every lesson and arcade game — plain outbound links to
 * each company's own official site. Not an embedded signup flow, not run or
 * endorsed by WickBetts, and not personalized advice. Which group of
 * companies shows depends on the module's specialization (see
 * brokerCategoriesForSpecialization in learningData.ts); untagged
 * foundational modules show all three groups.
 */
export function BrokerLinksCard({ specialization }: { specialization?: Specialization }) {
  const colors = useColors();
  const categories = brokerCategoriesForSpecialization(specialization);
  const hasPartner = categories.some((cat) => BROKER_LINKS[cat].some((l) => l.partner));

  return (
    <Card style={styles.card}>
      <SectionLabel>Ready to practice for real?</SectionLabel>
      <Text style={[styles.intro, { color: colors.mutedForeground }]}>
        Outside links to each company's own site — WickBetts doesn't operate any of them, and this isn't investment advice.{hasPartner ? ' Links tagged Partner are WickBetts referral links; WickBetts may earn a commission if you sign up.' : ''}
      </Text>
      {categories.map((cat) => (
        <View key={cat} style={styles.group}>
          <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>{CATEGORY_LABEL[cat]}</Text>
          <View style={styles.linkList}>
            {BROKER_LINKS[cat].map((link) => (
              <Pressable
                key={link.name}
                onPress={() => void Linking.openURL(link.url)}
                style={[styles.linkChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                accessibilityRole="link"
                accessibilityLabel={`Open ${link.name}`}
              >
                <TickerIcon symbol={link.name} logoUrl={brokerLogoUrl(link.domain)} size={30} />
                <View style={{ flex: 1, marginLeft: 4 }}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.linkName, { color: colors.foreground }]}>{link.name}</Text>
                    {link.partner ? (
                      <View style={[styles.partnerTag, { borderColor: colors.primary }]}>
                        <Text style={[styles.partnerText, { color: colors.primary }]}>PARTNER</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.linkBlurb, { color: colors.mutedForeground }]}>{link.blurb}</Text>
                </View>
                <Ionicons name="open-outline" size={14} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 14 },
  intro: { fontSize: 10, lineHeight: 14, fontFamily: 'Inter_400Regular', marginBottom: 14 },
  group: { marginBottom: 12 },
  groupLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
  linkList: { gap: 8 },
  linkChip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  partnerTag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, marginBottom: 2 },
  partnerText: { fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  linkName: { fontSize: 12, fontFamily: 'Inter_700Bold', marginBottom: 2 },
  linkBlurb: { fontSize: 10, lineHeight: 14, fontFamily: 'Inter_400Regular' },
});
