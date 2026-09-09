import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, SectionLabel } from '@/components/WickUI';
import { useColors } from '@/hooks/useColors';
import { BROKER_LINKS, brokerCategoriesForSpecialization, type BrokerCategory, type Specialization } from '@/lib/learningData';

const CATEGORY_LABEL: Record<BrokerCategory, string> = {
  'stocks-options': 'Stocks & options',
  crypto: 'Crypto',
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

  return (
    <Card style={styles.card}>
      <SectionLabel>Ready to practice for real?</SectionLabel>
      <Text style={[styles.intro, { color: colors.mutedForeground }]}>
        Outside links to each company's own site — WickBetts doesn't operate or endorse any of them, and this isn't investment advice.
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
                <View style={{ flex: 1 }}>
                  <Text style={[styles.linkName, { color: colors.foreground }]}>{link.name}</Text>
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
  linkName: { fontSize: 12, fontFamily: 'Inter_700Bold', marginBottom: 2 },
  linkBlurb: { fontSize: 10, lineHeight: 14, fontFamily: 'Inter_400Regular' },
});
