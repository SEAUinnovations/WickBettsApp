import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card, Header, Screen, SectionLabel, Tag } from '@/components/WickUI';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/apiUrl';

type Thread = 'Signals' | 'News' | 'Community Chat';

interface CommunityPost {
  id: string;
  thread: Thread;
  text: string;
  createdAt: string;
  authorId: string;
  authorName: string | null;
}

function initials(name: string | null | undefined): string {
  if (!name) return '??';
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function CommunityScreen() {
  const colors = useColors();
  const { getToken, user } = useAuth();
  const [thread, setThread] = useState<Thread>('Signals');
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const tabs: Thread[] = ['Signals', 'News', 'Community Chat'];

  const fetchPosts = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${API_BASE}/community`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { posts: CommunityPost[] };
      // API returns newest-first; reverse so newest renders at bottom
      setPosts(data.posts.slice().reverse());
      setError(null);
    } catch (err) {
      setError('Could not load messages. Pull to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken]);

  useEffect(() => {
    void fetchPosts();
  }, [fetchPosts]);

  const scrollRef = useRef<ScrollView>(null);

  const send = async () => {
    if (!draft.trim() || sending) return;
    const text = draft.trim();
    setDraft('');
    setSending(true);

    // Optimistic update
    const optimisticPost: CommunityPost = {
      id: `optimistic-${Date.now()}`,
      thread: 'Community Chat',
      text,
      createdAt: new Date().toISOString(),
      authorId: user?.id ?? '',
      authorName: user?.name ?? 'You',
    };
    setPosts((prev) => [...prev, optimisticPost]);
    setThread('Community Chat');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${API_BASE}/community`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ thread: 'Community Chat', text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { post: CommunityPost };
      // Replace the optimistic entry with the canonical server response
      setPosts((prev) =>
        prev.map((p) => (p.id === optimisticPost.id ? data.post : p))
      );
    } catch {
      // Roll back the optimistic post and restore the draft
      setPosts((prev) => prev.filter((p) => p.id !== optimisticPost.id));
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  const currentPosts = posts.filter((p) => p.thread === thread);

  return (
    <Screen contentStyle={styles.content}>
      <Header eyebrow="Wick Betts / Members only" title="Community" action="Alerts" onAction={() => {}} />
      <Text style={[styles.description, { color: colors.mutedForeground }]}>
        Three rooms. No noise. Keep the conversation useful.
      </Text>

      {/* Thread tabs */}
      <View style={[styles.threadBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {tabs.map((item) => (
          <Pressable
            key={item}
            onPress={() => setThread(item)}
            style={({ pressed }) => [
              styles.threadTab,
              thread === item && { backgroundColor: colors.primary },
              pressed && { opacity: 0.82 },
            ]}
            accessibilityRole="tab"
          >
            <Text style={[styles.threadText, { color: thread === item ? colors.primaryForeground : colors.mutedForeground }]}>
              {item}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.roomHeader}>
        <SectionLabel>{thread}</SectionLabel>
        <Tag tone="green">Members only</Tag>
      </View>

      {/* Message list */}
      <ScrollView
        ref={scrollRef}
        style={styles.messageList}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchPosts(true)}
            tintColor={colors.primary}
          />
        }
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.spinner} />
        ) : error ? (
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>{error}</Text>
        ) : currentPosts.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No messages yet. Be the first to post.
          </Text>
        ) : (
          currentPosts.map((post) => (
            <Card key={post.id} style={styles.messageCard}>
              <View style={styles.messageTop}>
                <View
                  style={[
                    styles.avatar,
                    {
                      backgroundColor:
                        post.authorName === 'Wick Betts' ? colors.primary : colors.secondary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.avatarText,
                      {
                        color:
                          post.authorName === 'Wick Betts'
                            ? colors.primaryForeground
                            : colors.accent,
                      },
                    ]}
                  >
                    {initials(post.authorName)}
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.author, { color: colors.foreground }]}>
                    {post.authorName ?? 'Member'}
                  </Text>
                  <Text style={[styles.time, { color: colors.mutedForeground }]}>
                    {formatTime(post.createdAt)}
                  </Text>
                </View>
              </View>
              <Text style={[styles.messageText, { color: colors.mutedForeground }]}>
                {post.text}
              </Text>
            </Card>
          ))
        )}
      </ScrollView>

      {/* Composer — only shown on Community Chat tab */}
      {thread === 'Community Chat' && (
        <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            testID="community-composer"
            value={draft}
            onChangeText={setDraft}
            placeholder="Add to Community Chat..."
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground }]}
            multiline
            editable={!sending}
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim() || sending}
            style={({ pressed }) => [
              styles.sendButton,
              { backgroundColor: draft.trim() && !sending ? colors.primary : colors.muted },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : (
              <Ionicons
                name="arrow-up"
                size={18}
                color={draft.trim() ? colors.primaryForeground : colors.mutedForeground}
              />
            )}
          </Pressable>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 120, flex: 1 },
  description: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginBottom: 18 },
  threadBar: { borderWidth: 1, borderRadius: 15, padding: 4, flexDirection: 'row', marginBottom: 24, overflow: 'hidden' },
  threadTab: { flex: 1, minHeight: 39, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  threadText: { fontSize: 10, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  roomHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  messageList: { flex: 1 },
  spinner: { marginTop: 40 },
  errorText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 40 },
  emptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 40 },
  messageCard: { marginBottom: 12 },
  messageTop: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  author: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  time: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2 },
  messageText: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 14 },
  composer: { borderWidth: 1, borderRadius: 17, minHeight: 58, paddingLeft: 14, paddingRight: 7, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  input: { flex: 1, minHeight: 40, maxHeight: 72, fontSize: 12, fontFamily: 'Inter_400Regular', paddingTop: 10 },
  sendButton: { height: 42, width: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
