import React, { useEffect } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Header, Screen } from '@/components/WickUI';
import { useColors } from '@/hooks/useColors';
import { useNotifications, type AppNotification } from '@/context/NotificationsContext';

function iconForType(type: string): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'signal':
      return 'flash-outline';
    default:
      return 'notifications-outline';
  }
}

function timeAgo(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const diffMs = Date.now() - then;
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function NotificationRow({ notification }: { notification: AppNotification }) {
  const colors = useColors();
  const router = useRouter();
  const onPress = notification.type === 'signal' ? () => router.push('/signals') : undefined;
  return (
    <Card onPress={onPress} style={styles.row}>
      <View style={[styles.iconCircle, { backgroundColor: colors.secondary }]}>
        <Ionicons name={iconForType(notification.type)} size={17} color={colors.accent} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[styles.title, { color: colors.foreground }]}>{notification.title}</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>{notification.body}</Text>
        <Text style={[styles.time, { color: colors.mutedForeground }]}>{timeAgo(notification.createdAt)}</Text>
      </View>
    </Card>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { notifications, isLoading, refresh, markSeen } = useNotifications();

  // Refresh with the latest feed and clear the bell's badge the moment a
  // member actually opens this screen — not before, so the badge stays
  // accurate for anyone who never opens it.
  useEffect(() => {
    void refresh();
    void markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen scroll={false}>
      <Header eyebrow="Wick Betts" title="Alerts" onAction={() => router.back()} />
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void refresh()} tintColor={colors.primary} />}
      >
        {isLoading && notifications.length === 0 ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : notifications.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="notifications-outline" size={22} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No alerts yet. New signals will show up here as soon as they're published.
            </Text>
          </View>
        ) : (
          notifications.map((n) => <NotificationRow key={n.id} notification={n} />)
        )}
        <Pressable onPress={() => router.back()} style={styles.backLink} accessibilityRole="button">
          <Text style={[styles.backLinkText, { color: colors.mutedForeground }]}>Close</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  iconCircle: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  body: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 3, lineHeight: 17 },
  time: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 6 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 20, lineHeight: 19 },
  backLink: { alignItems: 'center', paddingVertical: 20 },
  backLinkText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
