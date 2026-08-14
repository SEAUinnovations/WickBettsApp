import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Card, Header, Screen, SectionLabel, Tag } from '@/components/WickUI';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/apiUrl';

type Thread = 'Signals' | 'News' | 'Community Chat' | 'Trade Review';
type Bias = 'Bullish' | 'Bearish' | 'Neutral';
type Verdict = 'Agrees' | 'Disagrees' | 'Mixed';

interface TradeReview {
  id: string;
  authorId: string;
  authorName: string | null;
  avatarUrl?: string | null;
  imageDataUrl: string;
  description: string;
  bias: Bias;
  aiTechnicalRead: string;
  aiVerdict: Verdict;
  aiBiasExplanation: string;
  aiRiskNote: string;
  aiSummary: string;
  createdAt: string;
}

interface PostReactions {
  counts: Record<string, number>;
  mine: string[];
}

interface CommunityPost {
  id: string;
  thread: Thread;
  text: string;
  createdAt: string;
  authorId: string;
  authorName: string | null;
  avatarUrl?: string | null;
  reactions?: PostReactions;
}

const DEFAULT_REACTIONS = ['👍', '🔥', '💯', '😂', '🚀', '📉'];

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
  const router = useRouter();
  const colors = useColors();
  const { getToken, user, buyTradeReviewCredit } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [thread, setThread] = useState<Thread>('Signals');
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const tabs: Thread[] = ['Signals', 'News', 'Community Chat', 'Trade Review'];

  // Trade Review has its own backing store (separate endpoint/table from
  // the plain-text community posts, since it carries an image + structured
  // AI verdict rather than just a message body).
  const [tradeReviews, setTradeReviews] = useState<TradeReview[]>([]);
  const [tradeReviewsLoading, setTradeReviewsLoading] = useState(true);
  const [tradeReviewsError, setTradeReviewsError] = useState<string | null>(null);
  const [reviewImage, setReviewImage] = useState<{ uri: string; dataUrl: string } | null>(null);
  const [reviewDescription, setReviewDescription] = useState('');
  const [reviewBias, setReviewBias] = useState<Bias>('Bullish');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewUsage, setReviewUsage] = useState<{ usedThisWindow: number; freeRemaining: number; credits: number } | null>(null);
  const [buyingCredit, setBuyingCredit] = useState(false);

  const fetchTradeReviews = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${API_BASE}/trade-reviews`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        reviews: TradeReview[];
        usage: { usedThisWindow: number; freeRemaining: number; credits: number };
      };
      setTradeReviews(data.reviews);
      setReviewUsage(data.usage);
      setTradeReviewsError(null);
    } catch {
      setTradeReviewsError('Could not load trade reviews. Pull to retry.');
    } finally {
      setTradeReviewsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void fetchTradeReviews();
  }, [fetchTradeReviews]);

  const pickReviewImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to attach a chart screenshot.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert("Couldn't read image", 'Try a different screenshot.');
      return;
    }
    const mime = asset.mimeType ?? 'image/jpeg';
    setReviewImage({ uri: asset.uri, dataUrl: `data:${mime};base64,${asset.base64}` });
  };

  const submitReview = async () => {
    if (!reviewImage || !reviewDescription.trim() || submittingReview) return;
    setSubmittingReview(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${API_BASE}/trade-reviews`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageDataUrl: reviewImage.dataUrl,
          description: reviewDescription.trim(),
          bias: reviewBias,
        }),
      });
      if (res.status === 402) {
        const err = (await res.json().catch(() => ({}))) as { error?: string; pricePerReviewCents?: number };
        const price = ((err.pricePerReviewCents ?? 250) / 100).toFixed(2);
        Alert.alert(
          'Weekly free reviews used up',
          err.error ?? `You've used your free reviews this week. Buy another for $${price}?`,
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: `Buy for $${price}`,
              onPress: () => void purchaseCreditThenPrompt(),
            },
          ],
        );
        return;
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to submit trade for review');
      }
      const data = (await res.json()) as {
        review: TradeReview;
        usage: { usedThisWindow: number; freeRemaining: number; credits: number };
      };
      setTradeReviews((prev) => [data.review, ...prev]);
      setReviewUsage(data.usage);
      setReviewImage(null);
      setReviewDescription('');
      setReviewBias('Bullish');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Review failed', e instanceof Error ? e.message : 'The AI could not review this chart. Try again.');
    } finally {
      setSubmittingReview(false);
    }
  };

  // Opens Stripe Checkout for one extra credit. The member finishes payment
  // in the browser and returns to the app — rather than try to silently
  // resume the original submission (fragile: the browser round-trip loses
  // in-memory state on some platforms), just let them know to hit submit
  // again once they're back.
  const purchaseCreditThenPrompt = async () => {
    if (buyingCredit) return;
    setBuyingCredit(true);
    try {
      await buyTradeReviewCredit();
      Alert.alert('Almost there', "Complete the purchase in your browser, then come back and tap Submit for review again.");
    } catch (e) {
      Alert.alert('Purchase failed', e instanceof Error ? e.message : 'Could not start checkout. Try again.');
    } finally {
      setBuyingCredit(false);
    }
  };

  const verdictTone = (v: Verdict): 'green' | 'orange' | 'muted' =>
    v === 'Agrees' ? 'green' : v === 'Disagrees' ? 'orange' : 'muted';

  const [allowedReactions, setAllowedReactions] = useState<string[]>(DEFAULT_REACTIONS);

  const fetchPosts = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${API_BASE}/community`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { posts: CommunityPost[]; allowedReactions?: string[] };
      // API returns newest-first; reverse so newest renders at bottom
      setPosts(data.posts.slice().reverse());
      if (data.allowedReactions) setAllowedReactions(data.allowedReactions);
      setError(null);
    } catch (err) {
      setError('Could not load messages. Pull to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken]);

  // Optimistic toggle: flip the local counts/mine immediately, roll back if
  // the request fails. Reactions are low-stakes enough that an optimistic
  // update with silent rollback (no error alert) is the right amount of
  // ceremony — the tap itself is the only feedback a user expects.
  const toggleReaction = useCallback(
    async (postId: string, emoji: string) => {
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          const current = p.reactions ?? { counts: {}, mine: [] };
          const active = current.mine.includes(emoji);
          const nextCount = Math.max(0, (current.counts[emoji] ?? 0) + (active ? -1 : 1));
          return {
            ...p,
            reactions: {
              counts: { ...current.counts, [emoji]: nextCount },
              mine: active ? current.mine.filter((e) => e !== emoji) : [...current.mine, emoji],
            },
          };
        }),
      );
      try {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await fetch(`${API_BASE}/community/${postId}/react`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        void Haptics.selectionAsync();
      } catch {
        void fetchPosts();
      }
    },
    [getToken, fetchPosts],
  );

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
      avatarUrl: user?.avatarUrl ?? null,
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
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { post: CommunityPost };
      // Replace the optimistic entry with the canonical server response
      setPosts((prev) =>
        prev.map((p) => (p.id === optimisticPost.id ? data.post : p))
      );
    } catch (e) {
      // Roll back the optimistic post and restore the draft
      setPosts((prev) => prev.filter((p) => p.id !== optimisticPost.id));
      setDraft(text);
      if (e instanceof Error && e.message && e.message !== 'HTTP 500') {
        Alert.alert('Message not sent', e.message);
      }
    } finally {
      setSending(false);
    }
  };

  const currentPosts = posts.filter((p) => p.thread === thread);

  return (
    <Screen contentStyle={styles.content}>
      <Header eyebrow="Wick Betts / Members only" title="Community" action="Alerts" onAction={() => router.push('/news')} />
      <Text style={[styles.description, { color: colors.mutedForeground }]}>
        Three rooms. No noise. Keep the conversation useful.
      </Text>

      {isAdmin ? (
        <Card style={styles.adminCard}>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>Admin quick action: jump into the studio or user management while moderating the live rooms.</Text>
          <View style={styles.adminActions}>
            <Pressable onPress={() => router.push('/admin')} style={styles.adminLink} accessibilityRole="button">
              <Text style={[styles.adminLinkText, { color: colors.primary }]}>Open signal studio</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/admin/users')} style={styles.adminLink} accessibilityRole="button">
              <Text style={[styles.adminLinkText, { color: colors.primary }]}>Manage users</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}

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

      {thread === 'Trade Review' ? (
        <>
          {/* Trade Review feed */}
          <ScrollView
            style={styles.messageList}
            refreshControl={
              <RefreshControl refreshing={false} onRefresh={() => fetchTradeReviews()} tintColor={colors.primary} />
            }
            showsVerticalScrollIndicator={false}
          >
            {tradeReviewsLoading ? (
              <ActivityIndicator color={colors.primary} style={styles.spinner} />
            ) : tradeReviewsError ? (
              <Text style={[styles.errorText, { color: colors.mutedForeground }]}>{tradeReviewsError}</Text>
            ) : tradeReviews.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No trades submitted yet. Drop a chart screenshot below and the AI will review it instantly.
              </Text>
            ) : (
              tradeReviews.map((review) => (
                <Card key={review.id} style={styles.messageCard}>
                  <View style={styles.messageTop}>
                    {review.avatarUrl ? (
                      <Image source={{ uri: review.avatarUrl }} style={styles.avatar} accessibilityLabel={review.authorName ?? 'Member avatar'} />
                    ) : (
                      <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
                        <Text style={[styles.avatarText, { color: colors.accent }]}>{initials(review.authorName)}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.author, { color: colors.foreground }]}>{review.authorName ?? 'Member'}</Text>
                      <Text style={[styles.time, { color: colors.mutedForeground }]}>{formatTime(review.createdAt)}</Text>
                    </View>
                    <Tag tone={review.bias === 'Bullish' ? 'green' : review.bias === 'Bearish' ? 'orange' : 'muted'}>
                      {review.bias}
                    </Tag>
                  </View>

                  <Image source={{ uri: review.imageDataUrl }} style={styles.chartImage} resizeMode="cover" />

                  <Text style={[styles.messageText, { color: colors.mutedForeground }]}>{review.description}</Text>

                  <View style={[styles.aiReviewBox, { backgroundColor: colors.muted }]}>
                    <View style={styles.aiReviewHeader}>
                      <Text style={[styles.aiReviewLabel, { color: colors.primary }]}>AI READ</Text>
                      <Tag tone={verdictTone(review.aiVerdict)}>{review.aiVerdict} with bias</Tag>
                    </View>
                    <Text style={[styles.aiReviewText, { color: colors.foreground }]}>{review.aiTechnicalRead}</Text>
                    <Text style={[styles.aiReviewText, { color: colors.mutedForeground, marginTop: 8 }]}>{review.aiBiasExplanation}</Text>
                    <View style={[styles.riskNote, { borderTopColor: colors.border }]}>
                      <Ionicons name="warning-outline" size={13} color={colors.destructive} />
                      <Text style={[styles.riskNoteText, { color: colors.mutedForeground }]}>{review.aiRiskNote}</Text>
                    </View>
                  </View>
                </Card>
              ))
            )}
          </ScrollView>

          {/* Submit composer */}
          <View style={[styles.reviewComposer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {reviewUsage && user?.role !== 'admin' ? (
              <View style={styles.usageRow}>
                <Ionicons name="pulse-outline" size={12} color={colors.mutedForeground} />
                <Text style={[styles.usageText, { color: colors.mutedForeground }]}>
                  {reviewUsage.freeRemaining > 0
                    ? `${reviewUsage.freeRemaining} free review${reviewUsage.freeRemaining === 1 ? '' : 's'} left this week`
                    : reviewUsage.credits > 0
                      ? `Free reviews used — ${reviewUsage.credits} purchased credit${reviewUsage.credits === 1 ? '' : 's'} left`
                      : 'Free reviews used this week — $2.50 for another'}
                </Text>
              </View>
            ) : null}
            {reviewImage ? (
              <View style={styles.reviewImagePreviewRow}>
                <Image source={{ uri: reviewImage.uri }} style={styles.reviewImagePreview} />
                <Pressable onPress={() => setReviewImage(null)} accessibilityRole="button" style={styles.removeImageButton}>
                  <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => void pickReviewImage()}
                style={[styles.attachButton, { borderColor: colors.border }]}
                accessibilityRole="button"
              >
                <Ionicons name="camera-outline" size={16} color={colors.primary} />
                <Text style={[styles.attachButtonText, { color: colors.primary }]}>Attach chart screenshot</Text>
              </Pressable>
            )}

            <View style={styles.biasRow}>
              {(['Bullish', 'Bearish', 'Neutral'] as Bias[]).map((b) => (
                <Pressable
                  key={b}
                  onPress={() => setReviewBias(b)}
                  style={[
                    styles.biasChip,
                    { backgroundColor: reviewBias === b ? colors.primary : colors.background, borderColor: colors.border },
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.biasChipText, { color: reviewBias === b ? colors.primaryForeground : colors.mutedForeground }]}>{b}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              value={reviewDescription}
              onChangeText={setReviewDescription}
              placeholder="Describe your setup and why you're taking it..."
              placeholderTextColor={colors.mutedForeground}
              style={[styles.reviewInput, { color: colors.foreground, borderColor: colors.border }]}
              multiline
              editable={!submittingReview}
            />

            <Pressable
              onPress={submitReview}
              disabled={!reviewImage || !reviewDescription.trim() || submittingReview}
              style={[
                styles.reviewSubmitButton,
                { backgroundColor: reviewImage && reviewDescription.trim() && !submittingReview ? colors.primary : colors.muted },
              ]}
              accessibilityRole="button"
            >
              {submittingReview ? (
                <ActivityIndicator size="small" color={colors.mutedForeground} />
              ) : (
                <>
                  <Ionicons name="sparkles-outline" size={15} color={reviewImage && reviewDescription.trim() ? colors.primaryForeground : colors.mutedForeground} />
                  <Text style={[styles.reviewSubmitText, { color: reviewImage && reviewDescription.trim() ? colors.primaryForeground : colors.mutedForeground }]}>
                    {submittingReview ? 'AI is reviewing...' : 'Submit for review'}
                  </Text>
                </>
              )}
            </Pressable>
            <Text style={[styles.reviewDisclaimer, { color: colors.mutedForeground }]}>
              Educational only, not financial advice. Estimates may vary.
            </Text>
          </View>
        </>
      ) : (
        <>
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
                    {post.avatarUrl ? (
                      <Image
                        source={{ uri: post.avatarUrl }}
                        style={styles.avatar}
                        accessibilityLabel={post.authorName ?? 'Member avatar'}
                      />
                    ) : (
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
                    )}
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
                  <View style={styles.reactionRow}>
                    {allowedReactions.map((emoji) => {
                      const count = post.reactions?.counts[emoji] ?? 0;
                      const active = post.reactions?.mine.includes(emoji) ?? false;
                      return (
                        <Pressable
                          key={emoji}
                          onPress={() => void toggleReaction(post.id, emoji)}
                          style={[
                            styles.reactionChip,
                            {
                              backgroundColor: active ? colors.secondary : 'transparent',
                              borderColor: active ? colors.primary : colors.border,
                              opacity: count === 0 && !active ? 0.55 : 1,
                            },
                          ]}
                          accessibilityRole="button"
                        >
                          <Text style={styles.reactionEmoji}>{emoji}</Text>
                          {count > 0 ? (
                            <Text style={[styles.reactionCount, { color: active ? colors.primary : colors.mutedForeground }]}>{count}</Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
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
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 120, flex: 1 },
  description: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginBottom: 18 },
  adminCard: { marginBottom: 18 },
  adminActions: { flexDirection: 'row', gap: 12 },
  adminLink: { paddingVertical: 6, paddingHorizontal: 4 },
  adminLinkText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
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
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  reactionChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  composer: { borderWidth: 1, borderRadius: 17, minHeight: 58, paddingLeft: 14, paddingRight: 7, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  input: { flex: 1, minHeight: 40, maxHeight: 72, fontSize: 12, fontFamily: 'Inter_400Regular', paddingTop: 10 },
  sendButton: { height: 42, width: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  chartImage: { width: '100%', height: 190, borderRadius: 12, marginTop: 12, backgroundColor: '#171321' },
  aiReviewBox: { borderRadius: 12, padding: 12, marginTop: 14 },
  aiReviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 },
  aiReviewLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  aiReviewText: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  riskNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderTopWidth: 1, marginTop: 10, paddingTop: 10 },
  riskNoteText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  reviewComposer: { borderWidth: 1, borderRadius: 17, padding: 12, marginTop: 3, gap: 10 },
  usageRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  usageText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  attachButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 12 },
  attachButtonText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  reviewImagePreviewRow: { position: 'relative' },
  reviewImagePreview: { width: '100%', height: 130, borderRadius: 12 },
  removeImageButton: { position: 'absolute', top: 6, right: 6 },
  biasRow: { flexDirection: 'row', gap: 8 },
  biasChip: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  biasChipText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  reviewInput: { minHeight: 60, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, paddingTop: 10, fontSize: 12, fontFamily: 'Inter_400Regular', textAlignVertical: 'top' },
  reviewSubmitButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 44, borderRadius: 12 },
  reviewSubmitText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  reviewDisclaimer: { fontSize: 9, lineHeight: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
