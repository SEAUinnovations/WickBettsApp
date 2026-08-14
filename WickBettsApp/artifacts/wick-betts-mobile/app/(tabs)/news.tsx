import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Card, Header, SectionLabel, Tag } from '@/components/WickUI';
import { LapsedRecovery, SubscribePanel } from '@/components/Billing';
import { useColors } from '@/hooks/useColors';
import { useAuth, type Plan } from '@/context/AuthContext';
import { API_BASE } from '@/lib/apiUrl';
import { useNewsFeed, type NewsArticle } from '@/hooks/useNewsFeed';

type ToneType = 'purple' | 'orange' | 'muted' | 'green';

function categoryTone(cat: string): ToneType {
  switch (cat) {
    case 'Crypto': return 'orange';
    case 'Macro': return 'purple';
    case 'Earnings': return 'green';
    case 'Tech': return 'purple';
    default: return 'muted';
  }
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NewsCard({ article, isSaved, onToggleSave }: {
  article: NewsArticle;
  isSaved: boolean;
  onToggleSave: () => void;
}) {
  const colors = useColors();
  const tone = categoryTone(article.category);

  const openLink = () => {
    if (article.url) void Linking.openURL(article.url);
  };

  return (
    <Card style={styles.postCard}>
      <View style={styles.postTop}>
        <Tag tone={tone}>{article.category.toUpperCase()}</Tag>
        <Text style={[styles.time, { color: colors.mutedForeground }]}>
          {timeAgo(article.publishedAt)}
        </Text>
      </View>
      <Pressable onPress={openLink}>
        <Text style={[styles.postTitle, { color: colors.foreground }]} numberOfLines={3}>
          {article.headline}
        </Text>
      </Pressable>
      {article.summary && article.summary !== article.headline ? (
        <Text style={[styles.postSummary, { color: colors.mutedForeground }]} numberOfLines={2}>
          {article.summary}
        </Text>
      ) : null}
      <View style={[styles.postFooter, { borderTopColor: colors.border }]}>
        <Text style={[styles.source, { color: colors.accent }]}>{article.source}</Text>
        <View style={styles.footerActions}>
          {article.url ? (
            <Pressable onPress={openLink} style={styles.iconButton} accessibilityRole="button">
              <Ionicons name="open-outline" size={15} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
          <Pressable
            testID={`save-${article.id}`}
            onPress={onToggleSave}
            style={({ pressed }) => [styles.saveButton, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <Ionicons
              name={isSaved ? 'bookmark' : 'bookmark-outline'}
              size={16}
              color={isSaved ? colors.primary : colors.mutedForeground}
            />
            <Text style={[styles.saveText, { color: isSaved ? colors.primary : colors.mutedForeground }]}>
              {isSaved ? 'Saved' : 'Save'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

export default function NewsScreen() {
  const router = useRouter();
  const { user, subscription, getToken } = useAuth();
  const colors = useColors();
  const { articles, loading, error, subscriptionRequired, refresh } = useNewsFeed();
  const [saved, setSaved] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const isAdmin = user?.role === 'admin';
  const [editingId, setEditingId] = useState<string | null>(null);
  const [headlineDraft, setHeadlineDraft] = useState('');
  const [summaryDraft, setSummaryDraft] = useState('');
  const [categoryDraft, setCategoryDraft] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const startEditing = (article: NewsArticle) => {
    setEditingId(article.id);
    setHeadlineDraft(article.headline);
    setSummaryDraft(article.summary);
    setCategoryDraft(article.category);
  };

  const saveOverride = async (article: NewsArticle) => {
    setSavingOverride(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${API_BASE}/news/overrides`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sourceArticleId: article.id,
          headline: headlineDraft,
          summary: summaryDraft,
          category: categoryDraft,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditingId(null);
      await onRefresh();
    } finally {
      setSavingOverride(false);
    }
  };

  const removeArticle = async (article: NewsArticle) => {
    setRemovingId(article.id);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${API_BASE}/news/articles/${encodeURIComponent(article.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (editingId === article.id) setEditingId(null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await onRefresh();
    } catch {
      Alert.alert('Could not remove article', 'Try again in a moment.');
    } finally {
      setRemovingId(null);
    }
  };

  // Alert.alert's multi-button dialogs silently no-op on react-native-web, so
  // use window.confirm there (same pattern used for sign-out / delete-signal).
  const confirmRemove = (article: NewsArticle) => {
    const label = `Remove "${article.headline}" from the feed?`;
    if (Platform.OS === 'web') {
      if (window.confirm(label)) void removeArticle(article);
      return;
    }
    Alert.alert('Remove article', `${label} This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void removeArticle(article) },
    ]);
  };

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />
      }
    >
      <Header eyebrow="Wick Betts / The tape" title="News" action="Refresh" onAction={() => void onRefresh()} />
      <View style={styles.masthead}>
        <Text style={[styles.mastheadTitle, { color: colors.foreground }]}>Live from{'\n'}the market.</Text>
        <Text style={[styles.mastheadBody, { color: colors.mutedForeground }]}>
          Real headlines from WSJ and MarketWatch — refreshed every 15 minutes during market hours.
        </Text>
      </View>

      {isAdmin ? (
        <Card style={styles.adminCard}>
          <Text style={[styles.mastheadBody, { color: colors.mutedForeground }]}>Admin quick action: jump to the signal studio while reviewing the live feed.</Text>
          <Pressable onPress={() => router.push('/admin')} style={styles.retryButton} accessibilityRole="button">
            <Text style={[styles.retryText, { color: colors.primary }]}>Open signal studio</Text>
          </Pressable>
        </Card>
      ) : null}

      {subscriptionRequired ? (
        <View style={[styles.errorCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Ionicons name="lock-closed-outline" size={24} color={colors.primary} />
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>
            {subscription?.status === 'past_due' ? 'Payment past due' : 'The newsroom is for members'}
          </Text>
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
            {subscription?.status === 'past_due'
              ? "Your last payment didn't go through. Update your payment method to restore access."
              : subscription
              ? 'An active subscription is needed to view live headlines. Re-subscribe below to get back in.'
              : 'An active subscription unlocks live market headlines curated for the desk.'}
          </Text>
          {subscription ? (
            <LapsedRecovery
              status={subscription.status}
              plan={subscription.plan as Plan}
              hasStripeCustomer={user?.hasStripeCustomer ?? false}
            />
          ) : (
            <SubscribePanel />
          )}
        </View>
      ) : loading && !refreshing && articles.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Pulling the latest headlines…</Text>
        </View>
      ) : null}

      {error && articles.length === 0 ? (
        <View style={[styles.errorCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Ionicons name="wifi-outline" size={20} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>{error}</Text>
          <Pressable onPress={() => void onRefresh()} style={styles.retryButton} accessibilityRole="button">
            <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {articles.length > 0 ? (
        <>
          <SectionLabel>Latest briefings</SectionLabel>
          {articles.map((article) => (
            <View key={article.id}>
              <NewsCard
                article={article}
                isSaved={saved.includes(article.id)}
                onToggleSave={() =>
                  setSaved((curr) =>
                    curr.includes(article.id)
                      ? curr.filter((x) => x !== article.id)
                      : [...curr, article.id]
                  )
                }
              />
              {isAdmin ? (
                <Card style={styles.adminCardInline}>
                  {editingId === article.id ? (
                    <View style={styles.editorStack}>
                      <TextInput
                        value={headlineDraft}
                        onChangeText={setHeadlineDraft}
                        style={[styles.editorInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                        placeholder="Headline"
                        placeholderTextColor={colors.mutedForeground}
                      />
                      <TextInput
                        value={summaryDraft}
                        onChangeText={setSummaryDraft}
                        style={[styles.editorInput, styles.editorMultiline, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                        placeholder="Summary"
                        placeholderTextColor={colors.mutedForeground}
                        multiline
                      />
                      <TextInput
                        value={categoryDraft}
                        onChangeText={setCategoryDraft}
                        style={[styles.editorInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                        placeholder="Category"
                        placeholderTextColor={colors.mutedForeground}
                      />
                      <View style={styles.editorActions}>
                        <Pressable onPress={() => setEditingId(null)} style={styles.retryButton} accessibilityRole="button">
                          <Text style={[styles.retryText, { color: colors.mutedForeground }]}>Cancel</Text>
                        </Pressable>
                        <Pressable onPress={() => void saveOverride(article)} style={styles.retryButton} accessibilityRole="button">
                          <Text style={[styles.retryText, { color: colors.primary }]}>{savingOverride ? 'Saving…' : 'Save override'}</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.adminInlineActions}>
                      <Pressable onPress={() => startEditing(article)} accessibilityRole="button">
                        <Text style={[styles.retryText, { color: colors.primary }]}>Edit article copy</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => confirmRemove(article)}
                        disabled={removingId === article.id}
                        style={[styles.removeButton, removingId === article.id && { opacity: 0.5 }]}
                        accessibilityRole="button"
                        testID={`remove-news-${article.id}`}
                      >
                        <Ionicons name="trash-outline" size={14} color={colors.destructive} />
                        <Text style={[styles.retryText, { color: colors.destructive }]}>
                          {removingId === article.id ? 'Removing…' : 'Remove'}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </Card>
              ) : null}
            </View>
          ))}
          <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
            Data sourced from public RSS feeds. Delayed 15–20 min. Not investment advice.
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, paddingTop: 60, paddingBottom: 110 },
  masthead: { paddingVertical: 10, marginBottom: 25 },
  mastheadTitle: { fontSize: 32, lineHeight: 36, fontFamily: 'Inter_700Bold', letterSpacing: -1 },
  mastheadBody: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', marginTop: 10, maxWidth: 290 },
  adminCard: { marginBottom: 16 },
  adminCardInline: { marginBottom: 12, marginTop: -4 },
  editorStack: { gap: 10 },
  editorInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, fontFamily: 'Inter_400Regular' },
  editorMultiline: { minHeight: 90, textAlignVertical: 'top' },
  editorActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  adminInlineActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  removeButton: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  loadingWrap: { alignItems: 'center', paddingVertical: 40, gap: 14 },
  loadingText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  errorCard: { borderWidth: 1, borderRadius: 16, padding: 20, alignItems: 'center', gap: 10, marginBottom: 20 },
  errorTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  errorText: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  retryButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  retryText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  postCard: { marginBottom: 12 },
  postTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  time: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  postTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', lineHeight: 20, marginBottom: 7 },
  postSummary: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular', marginBottom: 10 },
  postFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 11, marginTop: 4 },
  source: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconButton: { padding: 2 },
  saveButton: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  saveText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  disclaimer: { fontSize: 10, textAlign: 'center', fontFamily: 'Inter_400Regular', marginTop: 16, lineHeight: 15 },
});
