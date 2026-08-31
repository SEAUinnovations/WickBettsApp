import React, { type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

export function Screen({
  children,
  scroll = true,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: object;
}) {
  const colors = useColors();
  const { ScrollView } = require('react-native') as typeof import('react-native');
  // The bottom tab bar renders with `position: 'absolute'` (see
  // app/(tabs)/_layout.tsx) so it floats over screen content instead of
  // reserving its own space — nothing pushes content up to clear it. Every
  // scrollable screen already works around this with its own
  // `contentStyle={{ paddingBottom: 108-110 }}`; this default covers any
  // screen that doesn't, and (more importantly) covers the `scroll={false}`
  // fixed-layout case, where there's no scrolling at all to reach past the
  // tab bar — without it, a bottom-pinned button (e.g. Community's Trade
  // Review / Shared Signals composer) renders fully underneath the tab bar,
  // invisible and untappable.
  const body = (
    <View style={[styles.screen, !scroll && styles.screenBottomClearance, { backgroundColor: colors.background }]}>
      {children}
    </View>
  );
  if (!scroll) return body;
  return (
    <ScrollView
      style={{ backgroundColor: colors.background, flex: 1 }}
      contentContainerStyle={[styles.scrollContent, contentStyle]}
      showsVerticalScrollIndicator={false}
      bounces
    >
      {body}
    </ScrollView>
  );
}

export function Header({
  eyebrow,
  title,
  action,
  onAction,
  badge,
}: {
  eyebrow: string;
  title: string;
  action?: string;
  onAction?: (event: GestureResponderEvent) => void;
  /** Unread count shown as a dot (or small number, capped at 9+) on the bell. Omit or pass 0 to show nothing. */
  badge?: number;
}) {
  const colors = useColors();
  return (
    <View style={styles.header}>
      <View>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>{eyebrow}</Text>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
      </View>
      {action && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={badge ? `${action}, ${badge} unread` : action}
          onPress={onAction}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: colors.secondary, borderColor: colors.border },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="notifications-outline" size={19} color={colors.accent} />
          {badge ? (
            <View style={[styles.badge, { backgroundColor: '#E5484D', borderColor: colors.secondary }]}>
              <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
      {children}
    </Text>
  );
}

export function Tag({
  children,
  tone = 'purple',
}: {
  children: ReactNode;
  tone?: 'purple' | 'green' | 'orange' | 'muted';
}) {
  const colors = useColors();
  const toneStyles = {
    purple: { backgroundColor: colors.secondary, color: colors.accent },
    green: { backgroundColor: '#11271E', color: '#7AE2AA' },
    orange: { backgroundColor: '#2B1D14', color: '#FDBA74' },
    muted: { backgroundColor: colors.muted, color: colors.mutedForeground },
  }[tone];
  return (
    <View style={[styles.tag, { backgroundColor: toneStyles.backgroundColor }]}>
      <Text style={[styles.tagText, { color: toneStyles.color }]}>{children}</Text>
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: object;
  onPress?: () => void;
}) {
  const colors = useColors();
  const content = (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

export function Metric({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string;
  detail?: string;
  color?: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: color ?? colors.foreground }]}>{value}</Text>
      {detail ? <Text style={[styles.metricDetail, { color: colors.mutedForeground }]}>{detail}</Text> : null}
    </View>
  );
}

export function PrimaryButton({
  children,
  onPress,
  icon,
  testID,
}: {
  children: ReactNode;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: colors.primary },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
        {children}
      </Text>
      {icon ? <Ionicons name={icon} size={18} color={colors.primaryForeground} /> : null}
    </Pressable>
  );
}

export function Divider() {
  const colors = useColors();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20 },
  screenBottomClearance: { paddingBottom: 110 },
  scrollContent: { flexGrow: 1, paddingBottom: 110 },
  header: {
    minHeight: 86,
    paddingTop: 20,
    paddingBottom: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 30,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.8,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 9,
    lineHeight: 11,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  card: { borderRadius: 18, borderWidth: 1, padding: 16 },
  tag: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  tagText: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, textTransform: 'uppercase' },
  metric: { flex: 1 },
  metricLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 5 },
  metricValue: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  metricDetail: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  primaryButton: { minHeight: 52, borderRadius: 15, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButtonText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  divider: { height: 1, marginVertical: 16 },
  pressed: { opacity: 0.72 },
});