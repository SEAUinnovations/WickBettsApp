import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useMarketData } from '@/hooks/useMarketData';

const GROUP_LABELS: Record<string, string> = {
  indices: 'Indices',
  megacap: 'Mega-cap',
  sectors: 'Sectors',
  finance: 'Finance',
  macro: 'Macro',
  crypto: 'Crypto',
};

const GROUP_ORDER = ['indices', 'megacap', 'sectors', 'finance', 'macro', 'crypto'];
const MAX_PER_GROUP = 6;

/**
 * Ticker input with a "top symbols per section" picker underneath — the
 * sections come from the same live market-data groups (indices, mega-cap,
 * sectors, finance, macro, crypto) already used on the Home tab's heat grid.
 * With no text typed it shows the top symbols in each section; typing
 * narrows every section to matches by symbol or company name.
 */
export function TickerAutocomplete({
  value,
  onChangeText,
  onSelect,
  placeholder = 'Ticker',
  testID,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSelect?: (symbol: string) => void;
  placeholder?: string;
  testID?: string;
}) {
  const colors = useColors();
  const { data } = useMarketData();
  const [focused, setFocused] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const quotes = data?.quotes ?? [];

  const grouped = useMemo(() => {
    const query = value.trim().toUpperCase();
    const bySection = new Map<string, { symbol: string; shortName: string }[]>();
    for (const q of quotes) {
      if (query && !q.symbol.toUpperCase().includes(query) && !q.shortName.toUpperCase().includes(query)) continue;
      const list = bySection.get(q.group) ?? [];
      if (list.length < MAX_PER_GROUP) list.push({ symbol: q.symbol, shortName: q.shortName });
      bySection.set(q.group, list);
    }
    return GROUP_ORDER.filter((g) => bySection.has(g)).map((g) => ({
      group: g,
      label: GROUP_LABELS[g] ?? g,
      items: bySection.get(g)!,
    }));
  }, [quotes, value]);

  const showPanel = focused && grouped.length > 0;

  const handleSelect = (symbol: string) => {
    if (blurTimeout.current) clearTimeout(blurTimeout.current);
    onChangeText(symbol);
    onSelect?.(symbol);
    setFocused(false);
  };

  return (
    <View>
      <TextInput
        testID={testID}
        style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={15}
        onFocus={() => {
          if (blurTimeout.current) clearTimeout(blurTimeout.current);
          setFocused(true);
        }}
        onBlur={() => {
          // Delay hiding so a tap on a suggestion chip below still registers
          // before the panel disappears (RN fires blur before the press).
          blurTimeout.current = setTimeout(() => setFocused(false), 150);
        }}
      />
      {showPanel ? (
        <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={styles.panelScroll}>
            {grouped.map(({ group, label, items }) => (
              <View key={group} style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{label}</Text>
                <View style={styles.chipRow}>
                  {items.map((item) => (
                    <Pressable
                      key={item.symbol}
                      onPress={() => handleSelect(item.symbol)}
                      style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.secondary }]}
                      accessibilityRole="button"
                      testID={`ticker-suggestion-${item.symbol}`}
                    >
                      <Text style={[styles.chipSymbol, { color: colors.foreground }]}>{item.symbol}</Text>
                      <Text style={[styles.chipName, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {item.shortName}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Inter_400Regular' },
  panel: { borderWidth: 1, borderRadius: 12, marginTop: 8, padding: 10, maxHeight: 260 },
  panelScroll: { maxHeight: 240 },
  section: { marginBottom: 10 },
  sectionLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, minWidth: 78 },
  chipSymbol: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  chipName: { fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 1 },
});
