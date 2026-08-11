import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card, Tag } from '@/components/WickUI';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/apiUrl';

const PRIMARY_ADMIN_EMAIL = 'bettstahlik@gmail.com';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  createdAt: string;
}

export default function AdminUsersScreen() {
  const router = useRouter();
  const colors = useColors();
  const { getToken, user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/admin/users`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Could not load the member roster.');
      const json = (await res.json()) as { users: AdminUser[] };
      setUsers(json.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the member roster.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (isAdmin) void loadUsers();
  }, [isAdmin, loadUsers]);

  const toggleRole = async (target: AdminUser) => {
    const nextRole = target.role === 'admin' ? 'member' : 'admin';
    setUpdatingId(target.id);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/admin/users/${target.id}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to update role.');
      }
      setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, role: nextRole } : u)));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update role.');
    } finally {
      setUpdatingId(null);
    }
  };

  const formatJoined = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  if (!isAdmin) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={styles.gate}>
          <Ionicons name="shield-outline" size={30} color={colors.mutedForeground} />
          <Text style={[styles.gateTitle, { color: colors.foreground }]}>Admin only</Text>
          <Text style={[styles.gateText, { color: colors.mutedForeground }]}>This room is not accessible to members.</Text>
          <Pressable onPress={() => router.back()} style={[styles.gateButton, { borderColor: colors.border }]} accessibilityRole="button">
            <Text style={[styles.gateButtonText, { color: colors.primary }]}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
            <Ionicons name="arrow-back" size={21} color={colors.foreground} />
          </Pressable>
          <View>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>WICK BETTS / ADMIN</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Member roster</Text>
          </View>
          <Tag>ADMIN</Tag>
        </View>

        <View style={[styles.notice, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Ionicons name="people-outline" size={18} color={colors.primary} />
          <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
            Grant or revoke admin permissions. The primary admin account cannot be demoted.
          </Text>
        </View>

        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : (
          users.map((u) => {
            const isPrimary = u.email === PRIMARY_ADMIN_EMAIL;
            const isUserAdmin = u.role === 'admin';
            const busy = updatingId === u.id;
            return (
              <Card key={u.id} style={styles.userRow}>
                <View style={styles.userTop}>
                  <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.avatarText, { color: colors.accent }]}>
                      {u.name ? u.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : '?'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameLine}>
                      <Text style={[styles.userName, { color: colors.foreground }]} numberOfLines={1}>{u.name || 'Member'}</Text>
                      <Tag tone={isUserAdmin ? 'green' : 'muted'}>{u.role}</Tag>
                    </View>
                    <Text style={[styles.userEmail, { color: colors.mutedForeground }]} numberOfLines={1}>{u.email}</Text>
                    <Text style={[styles.userJoined, { color: colors.mutedForeground }]}>Joined {formatJoined(u.createdAt)}</Text>
                  </View>
                </View>
                <View style={styles.userAction}>
                  {isPrimary ? (
                    <Text style={[styles.primaryAdmin, { color: colors.mutedForeground }]}>Primary admin</Text>
                  ) : (
                    <Pressable
                      onPress={() => void toggleRole(u)}
                      disabled={busy}
                      style={[styles.roleButton, { borderColor: colors.border }, busy && { opacity: 0.5 }]}
                      accessibilityRole="button"
                      testID={`toggle-role-${u.id}`}
                    >
                      <Ionicons
                        name={isUserAdmin ? 'remove-circle-outline' : 'add-circle-outline'}
                        size={15}
                        color={isUserAdmin ? colors.destructive : colors.primary}
                      />
                      <Text style={[styles.roleButtonText, { color: isUserAdmin ? colors.destructive : colors.primary }]}>
                        {busy ? 'Saving…' : isUserAdmin ? 'Revoke admin' : 'Grant admin'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, paddingTop: 25, paddingBottom: 50 },
  topBar: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, marginBottom: 6 },
  title: { fontSize: 27, fontFamily: 'Inter_700Bold', letterSpacing: -0.7 },
  notice: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 16 },
  noticeText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  error: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 12, lineHeight: 17 },
  userRow: { marginBottom: 12 },
  userTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userName: { flexShrink: 1, fontSize: 14, fontFamily: 'Inter_700Bold' },
  userEmail: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 3 },
  userJoined: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 3 },
  userAction: { marginTop: 14, alignItems: 'flex-start' },
  primaryAdmin: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  roleButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 9 },
  roleButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  gateTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', marginTop: 4 },
  gateText: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18 },
  gateButton: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10, marginTop: 6 },
  gateButtonText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});
