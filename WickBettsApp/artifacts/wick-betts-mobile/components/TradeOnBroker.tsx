import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { TickerIcon } from '@/components/TickerIcon';
import { brokerLogoUrl, TRADE_BROKER_DOMAINS } from '@/lib/brokerLogos';
import type { BrokerId, BrokerLink, Signal } from '@/context/SignalContext';

/**
 * "Trade on your broker" row on each live signal card.
 *
 * One tap opens the asset's own page on Webull or Robinhood. Nothing is
 * prefilled: prices move between the call and the moment a member acts, so
 * the member finds the contract (or share/coin quantity) themselves, at the
 * live price, and decides whether to place it. Wick Betts never sees or
 * touches a brokerage account.
 *
 * The last broker a member tapped is remembered on-device and shown first
 * as the highlighted button — no settings screen, no account linking.
 */

const PREFERRED_BROKER_KEY = 'wb-preferred-broker';

// Module-level so every card on the screen shares one read/write instead of
// each card hitting AsyncStorage separately.
let cachedPreference: BrokerId | null | undefined;
const listeners = new Set<(b: BrokerId | null) => void>();

async function loadPreference(): Promise<BrokerId | null> {
  if (cachedPreference !== undefined) return cachedPreference;
  try {
    const v = await AsyncStorage.getItem(PREFERRED_BROKER_KEY);
    cachedPreference = v === 'webull' || v === 'robinhood' ? v : null;
  } catch {
    cachedPreference = null;
  }
  return cachedPreference;
}

function savePreference(b: BrokerId) {
  cachedPreference = b;
  listeners.forEach((fn) => fn(b));
  AsyncStorage.setItem(PREFERRED_BROKER_KEY, b).catch(() => {});
}

function usePreferredBroker(): BrokerId | null {
  const [pref, setPref] = useState<BrokerId | null>(cachedPreference ?? null);
  useEffect(() => {
    let alive = true;
    void loadPreference().then((b) => alive && setPref(b));
    listeners.add(setPref);
    return () => {
      alive = false;
      listeners.delete(setPref);
    };
  }, []);
  return pref;
}

function findHint(signal: Signal): string {
  if (signal.isOption) {
    const side = signal.optionType ? ` ${signal.optionType}` : '';
    const strike = signal.strike ? ` · $${String(signal.strike).replace(/^\$/, '')}${side}` : side;
    const exp = signal.expiration ? `Exp ${signal.expiration}` : 'the listed expiry';
    return `Opens ${signal.asset}. Tap Options, then find ${exp}${strike}.`;
  }
  return `Opens ${signal.asset} on your broker.`;
}

export function TradeOnBroker({ signal }: { signal: Signal }) {
  const colors = useColors();
  const preferred = usePreferredBroker();
  const links = signal.brokerLinks ?? [];

  const ordered = useMemo(() => {
    if (!preferred) return links;
    return [...links].sort((a, b) => (a.broker === preferred ? -1 : b.broker === preferred ? 1 : 0));
  }, [links, preferred]);

  if (ordered.length === 0) return null;

  const open = (link: BrokerLink) => {
    savePreference(link.broker);
    void Haptics.selectionAsync().catch(() => {});
    void Linking.openURL(link.url).catch(() => {});
  };

  return (
    <View style={[styles.wrap, { borderTopColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>TRADE IT YOURSELF</Text>
      <View style={styles.buttons}>
        {ordered.map((link, i) => {
          const primary = i === 0;
          return (
            <Pressable
              key={link.broker}
              onPress={() => open(link)}
              accessibilityRole="link"
              accessibilityLabel={`Open ${signal.asset} on ${link.label}`}
              testID={`broker-${link.broker}-${signal.id}`}
              style={({ pressed }) => [
                styles.button,
                primary
                  ? { backgroundColor: colors.primary, borderColor: colors.primary }
                  : { backgroundColor: 'transparent', borderColor: colors.border },
                pressed && { opacity: 0.75 },
              ]}
            >
              <TickerIcon symbol={link.label} logoUrl={brokerLogoUrl(TRADE_BROKER_DOMAINS[link.broker])} size={18} />
              <Text style={[styles.buttonText, { color: primary ? colors.primaryForeground : colors.foreground }]}>
                {link.label}
              </Text>
              <Ionicons name="open-outline" size={13} color={primary ? colors.primaryForeground : colors.mutedForeground} />
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>{findHint(signal)}</Text>
      <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
        Nothing is prefilled — check the live price and place the order yourself. Wick Betts never sees your account. Not personalized advice.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: 1, marginTop: 14, paddingTop: 12 },
  label: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, marginBottom: 8 },
  buttons: { flexDirection: 'row', gap: 8 },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
  },
  buttonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  hint: { fontSize: 10, lineHeight: 14, fontFamily: 'Inter_500Medium', marginTop: 8 },
  disclaimer: { fontSize: 9, lineHeight: 13, fontFamily: 'Inter_400Regular', marginTop: 4, fontStyle: 'italic' },
});
