import React, { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Card, Header, SectionLabel, Tag } from '@/components/WickUI';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
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
  const { user } = useAuth();
  const colors = useColors();
  const { articles, loading, error, refresh } = useNewsFeed();
  const [saved, setSaved] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const isAdmin = user?.role === 'admin';

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
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
          Real headlines scraped from Yahoo Finance, CNBC, and WSJ — refreshed every 15 minutes during market hours.
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

      {loading && !refreshing && articles.length === 0 ? (
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
            <NewsCard
              key={article.id}
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
  loadingWrap: { alignItems: 'center', paddingVertical: 40, gap: 14 },
  loadingText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  errorCard: { borderWidth: 1, borderRadius: 16, padding: 20, alignItems: 'center', gap: 10, marginBottom: 20 },
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
