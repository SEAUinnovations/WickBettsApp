import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

/**
 * Best-effort ticker/asset icon for Signal and Shared Signal cards: renders
 * the real company/coin logo when the API supplied one (see resolveLogoUrl
 * in the API's routes/market.ts), falling back to the existing
 * initials-badge look everywhere a logo isn't known — an ETF, a
 * community-submitted ticker outside the tracked universe, or a transient
 * image-load failure (caught via onError, so a dead or blocked logo host
 * never leaves a blank hole in the card, it just quietly degrades to the
 * same badge every signal already showed before this feature existed).
 */
export function TickerIcon({
  symbol,
  logoUrl,
  size = 43,
}: {
  symbol: string;
  logoUrl?: string | null;
  size?: number;
}) {
  const colors = useColors();
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(logoUrl) && !failed;
  const radius = Math.round(size * 0.32);

  if (showImage) {
    return (
      <Image
        source={{ uri: logoUrl! }}
        style={[styles.image, { width: size, height: size, borderRadius: radius, backgroundColor: colors.secondary }]}
        resizeMode="contain"
        onError={() => setFailed(true)}
        accessibilityLabel={`${symbol} logo`}
      />
    );
  }

  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: radius, backgroundColor: colors.secondary }]}>
      <Text style={[styles.fallbackText, { color: colors.accent, fontSize: Math.round(size * 0.28) }]}>
        {symbol.slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {},
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackText: { fontFamily: 'Inter_700Bold' },
});
