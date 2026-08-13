import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useTickerDirectory } from '@/hooks/useTickerDirectory';

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

function formatPrice(price: number | null): string {
  if (price == null) return '';
  return price >= 1000 ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${price.toFixed(2)}`;
}

/**
 * Ticker input with a "top symbols per section" picker underneath, backed by
 * GET /api/market/tickers — a JSON dictionary of the top tickers in each
 * sector (indices, mega-cap, sectors, finance, macro, crypto) with live
 * price info. With no text typed it shows the top symbols in each section;
 * typing narrows every section to matches by symbol or company name.
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
  const { sections } = useTickerDirectory();
  const [focused, setFocused] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const grouped = useMemo(() => {
    const query = value.trim().toUpperCase();
    return GROUP_ORDER.map((group) => {
      const entries = Object.entries(sections[group] ?? {});
      const items = entries
        .filter(
          ([symbol, info]) =>
            !query || symbol.toUpperCase().includes(query) || info.shortName.toUpperCase().includes(query),
        )
        .slice(0, MAX_PER_GROUP)
        .map(([symbol, info]) => ({ symbol, ...info }));
      return { group, label: GROUP_LABELS[group] ?? group, items };
    }).filter((s) => s.items.length > 0);
  }, [sections, value]);

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
                  {items.map((item) => {
                    const pct = item.changePercent;
                    const pctColor = pct == null ? colors.mutedForeground : pct > 0 ? '#7AE2AA' : pct < 0 ? '#E27A7A' : colors.mutedForeground;
                    return (
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
                        {item.price != null ? (
                          <View style={styles.chipPriceRow}>
                            <Text style={[styles.chipPrice, { color: colors.foreground }]}>{formatPrice(item.price)}</Text>
                            {pct != null ? (
                              <Text style={[styles.chipPct, { color: pctColor }]}>
                                {pct >= 0 ? '+' : ''}
                                {pct.toFixed(2)}%
                              </Text>
                            ) : null}
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
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
  panel: { borderWidth: 1, borderRadius: 12, marginTop: 8, padding: 10, maxHeight: 280 },
  panelScroll: { maxHeight: 260 },
  section: { marginBottom: 10 },
  sectionLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, minWidth: 88 },
  chipSymbol: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  chipName: { fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 1 },
  chipPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  chipPrice: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  chipPct: { fontSize: 10, fontFamily: 'Inter_700Bold' },
});
