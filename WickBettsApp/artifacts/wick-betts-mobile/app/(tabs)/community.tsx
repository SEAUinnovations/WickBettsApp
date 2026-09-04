import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Card, Header, Screen, SectionLabel, Tag } from '@/components/WickUI';
import { TickerAutocomplete } from '@/components/TickerAutocomplete';
import { TickerIcon } from '@/components/TickerIcon';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useSignals, type Signal } from '@/context/SignalContext';
import { useNotifications } from '@/context/NotificationsContext';
import { API_BASE } from '@/lib/apiUrl';

type Thread = 'Signals' | 'News' | 'Community Chat' | 'Trade Review' | 'Shared Signals';
type Bias = 'Bullish' | 'Bearish' | 'Neutral';
type Verdict = 'Agrees' | 'Disagrees' | 'Mixed';
type SharedMarket = 'Stocks' | 'Crypto';
type SharedDirection = 'Long' | 'Short';
type SharedStatus = 'Open' | 'Closed';

// Member-shared trade ideas — distinct from both the admin-curated Signals
// tab (paid, Wick-authored) and the free-text "Signals" discussion thread
// above. Any member can post one; other members can follow the author to
// see their future shares. Never appears outside Community.
interface SharedSignal {
  id: string;
  authorId: string;
  authorName: string | null;
  avatarUrl?: string | null;
  asset: string;
  market: SharedMarket;
  direction: SharedDirection;
  entry: string;
  target: string;
  stop?: string | null;
  note: string;
  status: SharedStatus;
  createdAt: string;
  updatedAt: string;
  /** Best-effort logo image URL for `asset`, resolved server-side; null/absent falls back to an initials badge. */
  logoUrl?: string | null;
}

interface TradeReview {
  id: string;
  authorId: string;
  authorName: string | null;
  avatarUrl?: string | null;
  /** Mandatory on every new submission (enforced server-side); null only on
   *  reviews posted before this field existed. */
  symbol: string | null;
  /** Best-effort logo image URL for `symbol`, resolved server-side. */
  logoUrl?: string | null;
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

// Read-only card for a signal an admin has starred into the Community
// feed. Deliberately a separate, simpler component from (tabs)/signals.tsx's
// SignalCard rather than a shared import — this one has no admin controls
// (advance status / remove / watchlist), always shows full contract detail
// instead of expand-to-reveal, and this feed is capped at 4 items so there's
// no list-performance reason to keep it any more complex than it needs to be.
function StarredSignalCard({ signal }: { signal: Signal }) {
  const colors = useColors();
  return (
    <Card style={styles.messageCard}>
      <View style={styles.messageTop}>
        <TickerIcon symbol={signal.asset} logoUrl={signal.logoUrl} size={40} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={styles.starredTitleRow}>
            <Text style={[styles.author, { color: colors.foreground }]}>{signal.asset}</Text>
            {signal.isOption ? <Tag>{signal.optionType ?? 'OPTION'}</Tag> : null}
            <Tag tone="orange">{signal.style || 'Swing'}</Tag>
            <Tag tone={signal.direction === 'Long' ? 'green' : 'orange'}>{signal.direction}</Tag>
          </View>
          <Text style={[styles.time, { color: colors.mutedForeground }]}>
            {signal.market}{signal.sector ? ` · ${signal.sector}` : ''} · {signal.timeframe}
          </Text>
        </View>
        <Ionicons name="bookmark" size={16} color={colors.primary} accessibilityLabel="Featured in Community" />
      </View>

      {signal.isOption ? (
        <View style={[styles.starredContractBox, { backgroundColor: colors.muted }]}>
          <Text style={[styles.starredContractLabel, { color: colors.primary }]}>CONTRACT</Text>
          <Text style={[styles.starredContractName, { color: colors.foreground }]}>{signal.contract}</Text>
          <View style={styles.starredContractMetaRow}>
            <Text style={[styles.starredContractMetaText, { color: colors.mutedForeground }]}>Contracts {signal.contractAmount ?? 1}</Text>
            <Text style={[styles.starredContractMetaText, { color: colors.mutedForeground }]}>Expiry {signal.expiration}</Text>
            <Text style={[styles.starredContractMetaText, { color: colors.mutedForeground }]}>Strike {signal.strike}</Text>
            <Text style={[styles.starredContractMetaText, { color: colors.mutedForeground }]}>Premium {signal.premium}</Text>
          </View>
          <View style={styles.starredContractMetaRow}>
            <Text style={[styles.starredContractMetaText, { color: colors.mutedForeground }]}>Bid {signal.bid ?? '—'}</Text>
            <Text style={[styles.starredContractMetaText, { color: colors.mutedForeground }]}>Ask {signal.ask ?? '—'}</Text>
            <Text style={[styles.starredContractMetaText, { color: colors.mutedForeground }]}>IV {signal.impliedVolatility ?? '—'}</Text>
          </View>
          <View style={styles.starredContractMetaRow}>
            <Text style={[styles.starredContractMetaText, { color: colors.mutedForeground }]}>Δ {signal.delta?.toFixed(2) ?? '—'}</Text>
            <Text style={[styles.starredContractMetaText, { color: colors.mutedForeground }]}>Γ {signal.gamma?.toFixed(3) ?? '—'}</Text>
            <Text style={[styles.starredContractMetaText, { color: colors.mutedForeground }]}>Θ {signal.theta?.toFixed(2) ?? '—'}</Text>
            <Text style={[styles.starredContractMetaText, { color: colors.mutedForeground }]}>V {signal.vega?.toFixed(2) ?? '—'}</Text>
          </View>
          {signal.openInterest ? (
            <Text style={[styles.starredContractMetaText, { color: colors.mutedForeground, marginTop: 4 }]}>Open interest {signal.openInterest}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.starredLevelsRow, { borderTopColor: colors.border }]}>
        <View>
          <Text style={[styles.composerFieldLabel, { color: colors.mutedForeground }]}>{signal.isOption ? 'Debit' : 'Entry'}</Text>
          <Text style={[styles.starredLevelValue, { color: colors.foreground }]}>{signal.entry}</Text>
        </View>
        <View>
          <Text style={[styles.composerFieldLabel, { color: colors.mutedForeground }]}>Take profit</Text>
          <Text style={[styles.starredLevelValue, { color: colors.accent }]}>{signal.target}</Text>
        </View>
        {signal.stop ? (
          <View>
            <Text style={[styles.composerFieldLabel, { color: colors.mutedForeground }]}>Stop loss</Text>
            <Text style={[styles.starredLevelValue, { color: colors.destructive }]}>{signal.stop}</Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.messageText, { color: colors.mutedForeground }]}>{signal.analysis}</Text>
      {signal.analysisImageDataUrl ? (
        <Image source={{ uri: signal.analysisImageDataUrl }} style={styles.chartImage} resizeMode="cover" />
      ) : null}
    </Card>
  );
}

export default function CommunityScreen() {
  const router = useRouter();
  const colors = useColors();
  const { getToken, user, buyTradeReviewCredit } = useAuth();
  const isAdmin = user?.role === 'admin';
  // Community's "Signals" tab surfaces up to 4 admin-featured signals (see
  // communityStarred in lib/db/src/schema/signals.ts) with full contract
  // detail. This comes from its own fetch (communitySignals, backed by
  // GET /signals/community-starred) rather than the main Signals tab's
  // `signals` — that feed is gated to Signals/Mentorship plans only, but
  // this curated Community reel stays available to any active subscriber,
  // Membership included.
  const { communitySignals, isCommunitySignalsLoading: signalsLoading } = useSignals();
  const { unreadCount } = useNotifications();
  const starredSignals = communitySignals
    .filter((s) => s.status !== 'Closed' && s.status !== 'Stopped')
    .slice(0, 4);
  const [thread, setThread] = useState<Thread>('Signals');
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  // 'News' removed from Community's own tab bar — the app already has a
  // dedicated News tab in the bottom nav, so this one was redundant.
  const tabs: Thread[] = ['Signals', 'Community Chat', 'Shared Signals', 'Trade Review'];

  // Trade Review has its own backing store (separate endpoint/table from
  // the plain-text community posts, since it carries an image + structured
  // AI verdict rather than just a message body).
  const [tradeReviews, setTradeReviews] = useState<TradeReview[]>([]);
  const [tradeReviewsLoading, setTradeReviewsLoading] = useState(true);
  const [tradeReviewsError, setTradeReviewsError] = useState<string | null>(null);
  const [reviewImage, setReviewImage] = useState<{ uri: string; dataUrl: string } | null>(null);
  const [reviewSymbol, setReviewSymbol] = useState('');
  const [reviewDescription, setReviewDescription] = useState('');
  const [reviewBias, setReviewBias] = useState<Bias>('Bullish');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewUsage, setReviewUsage] = useState<{ usedThisWindow: number; freeRemaining: number; credits: number } | null>(null);
  const [buyingCredit, setBuyingCredit] = useState(false);
  // The feed needs its own scroll ref (distinct from Community Chat's
  // `scrollRef`) so a fresh submission — prepended at index 0 — can be
  // scrolled into view instead of landing off-screen above whatever the
  // member was already looking at.
  const reviewFeedRef = useRef<ScrollView>(null);
  // Briefly highlights the just-submitted review so it's unmistakable that
  // new results landed, even if the scroll-into-view above is subtle.
  const [highlightReviewId, setHighlightReviewId] = useState<string | null>(null);
  // Collapsed by default so the feed's `flex: 1` ScrollView gets nearly the
  // whole screen to show trade review history, instead of the always-open
  // composer (screenshot + bias + setup + submit) eating most of the
  // available height and squeezing the feed down to a sliver.
  const [composerOpen, setComposerOpen] = useState(false);
  // Which review card (if any) is expanded to show its full AI read. Cards
  // render collapsed by default so a member can scan many past reviews at
  // once; tapping a card opens just that one.
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
  // Chart screenshot currently shown full-screen, or null when the viewer
  // is closed. Tapping a review's image opens it here instead of expanding
  // the card, so the two gestures never fight each other.
  const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);

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
    if (!reviewImage || !reviewSymbol.trim() || !reviewDescription.trim() || submittingReview) return;
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
          symbol: reviewSymbol.trim().toUpperCase(),
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
      setReviewSymbol('');
      setReviewDescription('');
      setReviewBias('Bullish');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // The new review lands at the top of the feed — dismiss the keyboard,
      // collapse the composer so the feed expands back to full height, and
      // scroll there so the AI result is actually visible instead of
      // silently landing off-screen above the composer.
      Keyboard.dismiss();
      setComposerOpen(false);
      setHighlightReviewId(data.review.id);
      setTimeout(() => reviewFeedRef.current?.scrollTo({ y: 0, animated: true }), 60);
      setTimeout(() => setHighlightReviewId((current) => (current === data.review.id ? null : current)), 4000);
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

  // Shared Signals — member-posted trade ideas + who-follows-whom. Kept
  // separate from the plain-text `posts` store since it's structured data
  // with its own endpoint (see routes/community.ts's /signals + /follow).
  const [sharedSignals, setSharedSignals] = useState<SharedSignal[]>([]);
  const [sharedSignalsLoading, setSharedSignalsLoading] = useState(true);
  const [sharedSignalsError, setSharedSignalsError] = useState<string | null>(null);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [signalFeedScope, setSignalFeedScope] = useState<'All' | 'Following'>('All');
  const [csAsset, setCsAsset] = useState('');
  const [csMarket, setCsMarket] = useState<SharedMarket>('Stocks');
  const [csDirection, setCsDirection] = useState<SharedDirection>('Long');
  const [csEntry, setCsEntry] = useState('');
  const [csTarget, setCsTarget] = useState('');
  const [csStop, setCsStop] = useState('');
  const [csNote, setCsNote] = useState('');
  const [csSubmitting, setCsSubmitting] = useState(false);
  const [csError, setCsError] = useState<string | null>(null);
  const [followBusyId, setFollowBusyId] = useState<string | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);

  const fetchSharedSignals = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${API_BASE}/community/signals`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { signals: SharedSignal[]; following: string[] };
      setSharedSignals(data.signals);
      setFollowing(new Set(data.following));
      setSharedSignalsError(null);
    } catch {
      setSharedSignalsError('Could not load shared signals. Pull to retry.');
    } finally {
      setSharedSignalsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void fetchSharedSignals();
  }, [fetchSharedSignals]);

  const resetComposer = () => {
    setCsAsset('');
    setCsEntry('');
    setCsTarget('');
    setCsStop('');
    setCsNote('');
  };

  const submitSharedSignal = async () => {
    if (!csAsset.trim() || !csEntry.trim() || !csTarget.trim() || !csNote.trim() || csSubmitting) return;
    setCsSubmitting(true);
    setCsError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${API_BASE}/community/signals`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset: csAsset.trim().toUpperCase(),
          market: csMarket,
          direction: csDirection,
          entry: csEntry.trim(),
          target: csTarget.trim(),
          stop: csStop.trim() || undefined,
          note: csNote.trim(),
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to share signal');
      }
      const data = (await res.json()) as { signal: SharedSignal };
      setSharedSignals((prev) => [data.signal, ...prev]);
      resetComposer();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setCsError(e instanceof Error ? e.message : 'Failed to share signal');
    } finally {
      setCsSubmitting(false);
    }
  };

  // Optimistic follow toggle, mirroring toggleReaction's pattern above.
  const toggleFollow = async (userId: string) => {
    if (followBusyId) return;
    const wasFollowing = following.has(userId);
    setFollowBusyId(userId);
    setFollowing((prev) => {
      const next = new Set(prev);
      if (wasFollowing) next.delete(userId);
      else next.add(userId);
      return next;
    });
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${API_BASE}/community/follow/${userId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      void Haptics.selectionAsync();
    } catch {
      // Roll back on failure
      setFollowing((prev) => {
        const next = new Set(prev);
        if (wasFollowing) next.add(userId);
        else next.delete(userId);
        return next;
      });
    } finally {
      setFollowBusyId(null);
    }
  };

  const toggleSignalStatus = async (signal: SharedSignal) => {
    if (statusBusyId) return;
    const nextStatus: SharedStatus = signal.status === 'Open' ? 'Closed' : 'Open';
    setStatusBusyId(signal.id);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${API_BASE}/community/signals/${signal.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSharedSignals((prev) => prev.map((s) => (s.id === signal.id ? { ...s, status: nextStatus } : s)));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Could not update', 'Try again.');
    } finally {
      setStatusBusyId(null);
    }
  };

  const deleteSharedSignal = async (signal: SharedSignal) => {
    const doDelete = async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await fetch(`${API_BASE}/community/signals/${signal.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setSharedSignals((prev) => prev.filter((s) => s.id !== signal.id));
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        Alert.alert('Could not delete', 'Try again.');
      }
    };
    const label = `Delete your ${signal.asset} shared signal?`;
    if (Platform.OS === 'web') {
      if (window.confirm(label)) void doDelete();
      return;
    }
    Alert.alert('Delete signal', `${label} This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void doDelete() },
    ]);
  };

  // Remove a plain-text message (Signals / News / Community Chat threads —
  // they share one backing table/endpoint, see routes/community.ts). Author
  // or admin only, mirroring deleteSharedSignal's confirm-then-delete shape
  // above.
  const deletePost = async (post: CommunityPost) => {
    const doDelete = async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error('Not authenticated');
        const res = await fetch(`${API_BASE}/community/${post.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setPosts((prev) => prev.filter((p) => p.id !== post.id));
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        Alert.alert('Could not remove', 'Try again.');
      }
    };
    const label = 'Remove this message?';
    if (Platform.OS === 'web') {
      if (window.confirm(label)) void doDelete();
      return;
    }
    Alert.alert('Remove message', `${label} This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void doDelete() },
    ]);
  };

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
    // scroll={false}: this screen builds its own fixed-header /
    // flexible-feed / pinned-composer layout below (like a chat screen).
    // Screen's default scroll=true wraps everything in an outer ScrollView,
    // which nests it around the inner feed ScrollView — the inner `flex: 1`
    // then has no bounded height to size against, so the tabs, feed, and
    // composer all collapse together instead of laying out as intended.
    // That nested-scroll bug is the root cause of the feed feeling
    // "bunched together" and of newly-submitted results being unreachable.
    <Screen scroll={false}>
      <Header eyebrow="Wick Betts / Members only" title="Community" action="Alerts" onAction={() => router.push('/notifications')} badge={unreadCount} />
      <Text style={[styles.description, { color: colors.mutedForeground }]}>
        One community. No noise. Keep the conversation useful.
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

      {/* Keeps the composer clear of the on-screen keyboard on the two tabs
          with a text input pinned to the bottom, instead of the keyboard
          covering the submit button and (on Trade Review) the AI result. */}
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
      {thread === 'Signals' ? (
        <ScrollView style={styles.messageList} showsVerticalScrollIndicator={false}>
          <Text style={[styles.starredSectionHeader, { color: colors.mutedForeground }]}>
            Featured setups — up to 4 signals the desk has starred for the whole community, full contract detail included.
          </Text>
          {signalsLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.spinner} />
          ) : starredSignals.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No signals starred for Community right now. Check back soon.
            </Text>
          ) : (
            starredSignals.map((signal) => <StarredSignalCard key={signal.id} signal={signal} />)
          )}
        </ScrollView>
      ) : thread === 'Shared Signals' ? (
        <>
          {/* Following / All scope pills */}
          <View style={styles.signalScopeRow}>
            {(['All', 'Following'] as const).map((scope) => (
              <Pressable
                key={scope}
                onPress={() => setSignalFeedScope(scope)}
                style={[
                  styles.scopePill,
                  {
                    backgroundColor: signalFeedScope === scope ? colors.primary : colors.card,
                    borderColor: signalFeedScope === scope ? colors.primary : colors.border,
                  },
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.scopePillText, { color: signalFeedScope === scope ? colors.primaryForeground : colors.mutedForeground }]}>
                  {scope === 'Following' ? `Following (${following.size})` : 'All'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Shared signals feed */}
          <ScrollView
            style={styles.messageList}
            refreshControl={
              <RefreshControl refreshing={false} onRefresh={() => fetchSharedSignals()} tintColor={colors.primary} />
            }
            showsVerticalScrollIndicator={false}
          >
            {sharedSignalsLoading ? (
              <ActivityIndicator color={colors.primary} style={styles.spinner} />
            ) : sharedSignalsError ? (
              <Text style={[styles.errorText, { color: colors.mutedForeground }]}>{sharedSignalsError}</Text>
            ) : (() => {
              const visible = sharedSignals.filter(
                (s) => signalFeedScope === 'All' || following.has(s.authorId) || s.authorId === user?.id,
              );
              if (visible.length === 0) {
                return (
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                    {signalFeedScope === 'Following'
                      ? "You're not following anyone yet — switch to All to find members to follow."
                      : 'No shared signals yet. Be the first to post one below.'}
                  </Text>
                );
              }
              return visible.map((s) => {
                const isOwn = s.authorId === user?.id;
                const isFollowing = following.has(s.authorId);
                return (
                  <Card key={s.id} style={styles.messageCard}>
                    <View style={styles.messageTop}>
                      {s.avatarUrl ? (
                        <Image source={{ uri: s.avatarUrl }} style={styles.avatar} accessibilityLabel={s.authorName ?? 'Member avatar'} />
                      ) : (
                        <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
                          <Text style={[styles.avatarText, { color: colors.accent }]}>{initials(s.authorName)}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[styles.author, { color: colors.foreground }]}>{s.authorName ?? 'Member'}</Text>
                        <Text style={[styles.time, { color: colors.mutedForeground }]}>{formatTime(s.createdAt)}</Text>
                      </View>
                      {!isOwn ? (
                        <Pressable
                          onPress={() => void toggleFollow(s.authorId)}
                          disabled={followBusyId === s.authorId}
                          style={[
                            styles.followButton,
                            {
                              borderColor: isFollowing ? colors.border : colors.primary,
                              backgroundColor: isFollowing ? colors.muted : 'transparent',
                            },
                          ]}
                          accessibilityRole="button"
                        >
                          <Text style={[styles.followButtonText, { color: isFollowing ? colors.mutedForeground : colors.primary }]}>
                            {isFollowing ? 'Following' : 'Follow'}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>

                    <View style={styles.signalTagsRow}>
                      <TickerIcon symbol={s.asset} logoUrl={s.logoUrl} size={22} />
                      <Text style={[styles.signalAssetText, { color: colors.foreground }]}>{s.asset}</Text>
                      <Tag tone={s.direction === 'Long' ? 'green' : 'orange'}>{s.direction}</Tag>
                      <Tag tone="muted">{s.market}</Tag>
                      <Tag tone={s.status === 'Open' ? 'green' : 'muted'}>{s.status}</Tag>
                    </View>

                    <View style={[styles.signalLevels, { borderTopColor: colors.border }]}>
                      <View><Text style={[styles.levelLabel, { color: colors.mutedForeground }]}>Entry</Text><Text style={[styles.levelValue, { color: colors.foreground }]}>{s.entry}</Text></View>
                      <View><Text style={[styles.levelLabel, { color: colors.mutedForeground }]}>Target</Text><Text style={[styles.levelValue, { color: colors.accent }]}>{s.target}</Text></View>
                      {s.stop ? (
                        <View><Text style={[styles.levelLabel, { color: colors.mutedForeground }]}>Stop</Text><Text style={[styles.levelValue, { color: colors.destructive }]}>{s.stop}</Text></View>
                      ) : null}
                    </View>

                    <Text style={[styles.messageText, { color: colors.mutedForeground }]}>{s.note}</Text>

                    {isOwn ? (
                      <View style={styles.ownSignalActions}>
                        <Pressable
                          onPress={() => void toggleSignalStatus(s)}
                          disabled={statusBusyId === s.id}
                          style={[styles.smallActionButton, { borderColor: colors.border }]}
                          accessibilityRole="button"
                        >
                          <Ionicons name={s.status === 'Open' ? 'checkmark-circle-outline' : 'refresh-outline'} size={13} color={colors.primary} />
                          <Text style={[styles.smallActionText, { color: colors.primary }]}>{s.status === 'Open' ? 'Mark closed' : 'Reopen'}</Text>
                        </Pressable>
                        <Pressable onPress={() => void deleteSharedSignal(s)} style={[styles.smallActionButton, { borderColor: colors.border }]} accessibilityRole="button">
                          <Ionicons name="trash-outline" size={13} color={colors.destructive} />
                          <Text style={[styles.smallActionText, { color: colors.destructive }]}>Delete</Text>
                        </Pressable>
                      </View>
                    ) : isAdmin ? (
                      <View style={styles.ownSignalActions}>
                        <Pressable onPress={() => void deleteSharedSignal(s)} style={[styles.smallActionButton, { borderColor: colors.border }]} accessibilityRole="button">
                          <Ionicons name="trash-outline" size={13} color={colors.destructive} />
                          <Text style={[styles.smallActionText, { color: colors.destructive }]}>Remove</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </Card>
                );
              });
            })()}
          </ScrollView>

          {/* Share composer */}
          <View style={[styles.reviewComposer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.field}>
              <TickerAutocomplete value={csAsset} onChangeText={setCsAsset} placeholder="Ticker, e.g. NVDA" testID="shared-signal-ticker" />
            </View>
            <View style={styles.biasRow}>
              {(['Stocks', 'Crypto'] as SharedMarket[]).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setCsMarket(m)}
                  style={[styles.biasChip, { backgroundColor: csMarket === m ? colors.primary : colors.background, borderColor: colors.border }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.biasChipText, { color: csMarket === m ? colors.primaryForeground : colors.mutedForeground }]}>{m}</Text>
                </Pressable>
              ))}
              {(['Long', 'Short'] as SharedDirection[]).map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setCsDirection(d)}
                  style={[styles.biasChip, { backgroundColor: csDirection === d ? colors.primary : colors.background, borderColor: colors.border }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.biasChipText, { color: csDirection === d ? colors.primaryForeground : colors.mutedForeground }]}>{d}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.signalInputRow}>
              <TextInput value={csEntry} onChangeText={setCsEntry} placeholder="Entry" placeholderTextColor={colors.mutedForeground} style={[styles.signalSmallInput, { color: colors.foreground, borderColor: colors.border }]} />
              <TextInput value={csTarget} onChangeText={setCsTarget} placeholder="Target" placeholderTextColor={colors.mutedForeground} style={[styles.signalSmallInput, { color: colors.foreground, borderColor: colors.border }]} />
              <TextInput value={csStop} onChangeText={setCsStop} placeholder="Stop (optional)" placeholderTextColor={colors.mutedForeground} style={[styles.signalSmallInput, { color: colors.foreground, borderColor: colors.border }]} />
            </View>
            <TextInput
              value={csNote}
              onChangeText={setCsNote}
              placeholder="Why are you in this trade?"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.reviewInput, { color: colors.foreground, borderColor: colors.border }]}
              multiline
              editable={!csSubmitting}
            />
            {csError ? <Text style={[styles.errorText, { color: colors.destructive, marginTop: 0 }]}>{csError}</Text> : null}
            <Pressable
              onPress={() => void submitSharedSignal()}
              disabled={!csAsset.trim() || !csEntry.trim() || !csTarget.trim() || !csNote.trim() || csSubmitting}
              style={[
                styles.reviewSubmitButton,
                { backgroundColor: csAsset.trim() && csEntry.trim() && csTarget.trim() && csNote.trim() && !csSubmitting ? colors.primary : colors.muted },
              ]}
              accessibilityRole="button"
            >
              {csSubmitting ? (
                <ActivityIndicator size="small" color={colors.mutedForeground} />
              ) : (
                <>
                  <Ionicons name="share-social-outline" size={15} color={csAsset.trim() && csNote.trim() ? colors.primaryForeground : colors.mutedForeground} />
                  <Text style={[styles.reviewSubmitText, { color: csAsset.trim() && csNote.trim() ? colors.primaryForeground : colors.mutedForeground }]}>Share to community</Text>
                </>
              )}
            </Pressable>
            <Text style={[styles.reviewDisclaimer, { color: colors.mutedForeground }]}>
              Member-shared ideas, not reviewed by Wick Betts. Educational only, not financial advice.
            </Text>
          </View>
        </>
      ) : thread === 'Trade Review' ? (
        <>
          {/* Trade Review feed */}
          <ScrollView
            ref={reviewFeedRef}
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
              tradeReviews.map((review) => {
                const isExpanded = review.id === expandedReviewId;
                return (
                <Card
                  key={review.id}
                  onPress={() => setExpandedReviewId((prev) => (prev === review.id ? null : review.id))}
                  style={[
                    styles.messageCard,
                    review.id === highlightReviewId && { borderColor: colors.primary, borderWidth: 2 },
                  ]}
                >
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
                    {review.id === highlightReviewId ? (
                      <Tag tone="green">Just posted</Tag>
                    ) : (
                      <Tag tone={review.bias === 'Bullish' ? 'green' : review.bias === 'Bearish' ? 'orange' : 'muted'}>
                        {review.bias}
                      </Tag>
                    )}
                  </View>

                  {/* Ticker label — mandatory on every new submission (see
                      submitReview above); older reviews posted before this
                      field existed just omit the row rather than show a
                      blank/placeholder ticker. */}
                  {review.symbol ? (
                    <View style={styles.tradeReviewTickerRow}>
                      <TickerIcon symbol={review.symbol} logoUrl={review.logoUrl} size={20} />
                      <Text style={[styles.signalAssetText, { color: colors.foreground }]}>{review.symbol}</Text>
                    </View>
                  ) : null}

                  {/* Nested Pressable: tapping the chart opens the full-screen
                      viewer instead of toggling the card, since RN resolves
                      touches to the innermost pressable rather than bubbling. */}
                  <Pressable
                    onPress={() => setEnlargedImageUrl(review.imageDataUrl)}
                    accessibilityRole="button"
                    accessibilityLabel="Enlarge chart screenshot"
                  >
                    <Image source={{ uri: review.imageDataUrl }} style={styles.chartImage} resizeMode="cover" />
                    <View style={styles.expandImageHint}>
                      <Ionicons name="expand-outline" size={13} color="#fff" />
                    </View>
                  </Pressable>

                  <Text
                    style={[styles.messageText, { color: colors.mutedForeground }]}
                    numberOfLines={isExpanded ? undefined : 2}
                  >
                    {review.description}
                  </Text>

                  {isExpanded ? (
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
                      <View style={styles.collapseHintRow}>
                        <Ionicons name="chevron-up" size={13} color={colors.mutedForeground} />
                        <Text style={[styles.collapseHintText, { color: colors.mutedForeground }]}>Tap to collapse</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.collapseHintRow}>
                      <Ionicons name="sparkles-outline" size={13} color={colors.primary} />
                      <Text style={[styles.collapseHintText, { color: colors.primary }]}>Tap for AI read & risk note</Text>
                      <Ionicons name="chevron-down" size={13} color={colors.primary} />
                    </View>
                  )}
                </Card>
                );
              })
            )}
          </ScrollView>

          {/* Submit composer — collapsible. Minimized to a single tappable
              bar by default so the feed above is free to expand to (close
              to) the full screen; expands only when a member wants to add
              a new review. */}
          <View style={[styles.reviewComposer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {composerOpen ? (
              <Pressable
                onPress={() => setComposerOpen(false)}
                style={styles.composerToggleRow}
                accessibilityRole="button"
                accessibilityState={{ expanded: true }}
                accessibilityLabel="Collapse new trade review form"
              >
                <View style={styles.composerToggleLeft}>
                  <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                  <Text style={[styles.composerToggleText, { color: colors.foreground }]}>New trade review</Text>
                </View>
                <Ionicons name="chevron-up" size={18} color={colors.mutedForeground} />
              </Pressable>
            ) : (
              <>
                {/* A real button, not just a tappable bar, per member feedback
                    that the collapsed toggle didn't read as a clear
                    call-to-action for starting a new review. */}
                <Pressable
                  onPress={() => setComposerOpen(true)}
                  style={({ pressed }) => [
                    styles.newReviewButton,
                    { backgroundColor: colors.primary },
                    pressed && { opacity: 0.85 },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: false }}
                  accessibilityLabel="Create new trade review"
                >
                  <Ionicons name="add-circle" size={18} color={colors.primaryForeground} />
                  <Text style={[styles.newReviewButtonText, { color: colors.primaryForeground }]}>New Trade Review</Text>
                </Pressable>
                {reviewUsage && user?.role !== 'admin' ? (
                  <Text style={[styles.composerToggleSubtext, styles.newReviewSubtext, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {reviewUsage.freeRemaining > 0
                      ? `${reviewUsage.freeRemaining} free review${reviewUsage.freeRemaining === 1 ? '' : 's'} left`
                      : reviewUsage.credits > 0
                        ? `${reviewUsage.credits} credit${reviewUsage.credits === 1 ? '' : 's'} left`
                        : '$2.50 each'}
                  </Text>
                ) : null}
              </>
            )}

            {composerOpen ? (
              <>
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
                <View style={styles.composerField}>
                  <Text style={[styles.composerFieldLabel, { color: colors.mutedForeground }]}>Ticker</Text>
                  <TickerAutocomplete value={reviewSymbol} onChangeText={setReviewSymbol} placeholder="Ticker, e.g. NVDA" testID="trade-review-ticker" />
                </View>

                <View style={styles.composerField}>
                  <Text style={[styles.composerFieldLabel, { color: colors.mutedForeground }]}>Chart screenshot</Text>
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
                </View>

                <View style={styles.composerField}>
                  <Text style={[styles.composerFieldLabel, { color: colors.mutedForeground }]}>Your bias</Text>
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
                </View>

                <View style={styles.composerField}>
                  <Text style={[styles.composerFieldLabel, { color: colors.mutedForeground }]}>Your setup</Text>
                  <TextInput
                    value={reviewDescription}
                    onChangeText={setReviewDescription}
                    placeholder="Describe your setup and why you're taking it..."
                    placeholderTextColor={colors.mutedForeground}
                    style={[styles.reviewInput, { color: colors.foreground, borderColor: colors.border }]}
                    multiline
                    editable={!submittingReview}
                  />
                </View>

                <Pressable
                  onPress={submitReview}
                  disabled={!reviewImage || !reviewSymbol.trim() || !reviewDescription.trim() || submittingReview}
                  style={[
                    styles.reviewSubmitButton,
                    { backgroundColor: reviewImage && reviewSymbol.trim() && reviewDescription.trim() && !submittingReview ? colors.primary : colors.muted },
                  ]}
                  accessibilityRole="button"
                >
                  {submittingReview ? (
                    <ActivityIndicator size="small" color={colors.mutedForeground} />
                  ) : (
                    <>
                      <Ionicons name="sparkles-outline" size={15} color={reviewImage && reviewSymbol.trim() && reviewDescription.trim() ? colors.primaryForeground : colors.mutedForeground} />
                      <Text style={[styles.reviewSubmitText, { color: reviewImage && reviewSymbol.trim() && reviewDescription.trim() ? colors.primaryForeground : colors.mutedForeground }]}>
                        {submittingReview ? 'AI is reviewing...' : 'Submit for review'}
                      </Text>
                    </>
                  )}
                </Pressable>
                <Text style={[styles.reviewDisclaimer, { color: colors.mutedForeground }]}>
                  Educational only, not financial advice. Estimates may vary.
                </Text>
              </>
            ) : null}
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
                  {post.authorId === user?.id || isAdmin ? (
                    <View style={styles.ownSignalActions}>
                      <Pressable
                        onPress={() => void deletePost(post)}
                        style={[styles.smallActionButton, { borderColor: colors.border }]}
                        accessibilityRole="button"
                      >
                        <Ionicons name="trash-outline" size={13} color={colors.destructive} />
                        <Text style={[styles.smallActionText, { color: colors.destructive }]}>Remove</Text>
                      </Pressable>
                    </View>
                  ) : null}
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
      </KeyboardAvoidingView>

      {/* Full-screen chart viewer — opened by tapping a trade review's
          screenshot. Lives at the screen root (not inside the feed
          ScrollView) since Modal renders in its own native layer. */}
      <Modal
        visible={!!enlargedImageUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setEnlargedImageUrl(null)}
      >
        <Pressable style={styles.imageViewerBackdrop} onPress={() => setEnlargedImageUrl(null)} accessibilityRole="button" accessibilityLabel="Close chart viewer">
          <Pressable style={styles.imageViewerClose} onPress={() => setEnlargedImageUrl(null)} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
          {enlargedImageUrl ? (
            <Image source={{ uri: enlargedImageUrl }} style={styles.imageViewerImage} resizeMode="contain" />
          ) : null}
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  tradeReviewTickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  avatar: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  author: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  time: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2 },
  messageText: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 14 },
  starredSectionHeader: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18, marginBottom: 14 },
  starredTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  starredContractBox: { borderRadius: 12, padding: 12, marginTop: 14 },
  starredContractLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, marginBottom: 5 },
  starredContractName: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  starredContractMetaRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 6, marginTop: 8 },
  starredContractMetaText: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  starredLevelsRow: { flexDirection: 'row', gap: 20, marginTop: 14, paddingTop: 14, borderTopWidth: 1 },
  starredLevelValue: { fontSize: 14, fontFamily: 'Inter_700Bold', marginTop: 4 },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  reactionChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  composer: { borderWidth: 1, borderRadius: 17, minHeight: 58, paddingLeft: 14, paddingRight: 7, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  input: { flex: 1, minHeight: 40, maxHeight: 72, fontSize: 12, fontFamily: 'Inter_400Regular', paddingTop: 10 },
  sendButton: { height: 42, width: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  chartImage: { width: '100%', height: 190, borderRadius: 12, marginTop: 12, backgroundColor: '#171321' },
  expandImageHint: { position: 'absolute', right: 8, bottom: 8, width: 26, height: 26, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  aiReviewBox: { borderRadius: 12, padding: 12, marginTop: 14 },
  aiReviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 },
  aiReviewLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  aiReviewText: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  riskNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderTopWidth: 1, marginTop: 10, paddingTop: 10 },
  riskNoteText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  collapseHintRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  collapseHintText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  newReviewButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 13 },
  newReviewButtonText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  newReviewSubtext: { textAlign: 'center', marginTop: 7 },
  imageViewerBackdrop: { flex: 1, backgroundColor: 'rgba(4,3,8,0.96)', alignItems: 'center', justifyContent: 'center' },
  imageViewerClose: { position: 'absolute', top: 56, right: 20, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  imageViewerImage: { width: '100%', height: '70%' },
  keyboardAvoider: { flex: 1 },
  reviewComposer: { borderWidth: 1, borderRadius: 17, padding: 14, marginTop: 8, gap: 14 },
  composerToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  composerToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  composerToggleText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  composerToggleSubtext: { fontSize: 12, fontFamily: 'Inter_400Regular', flexShrink: 1 },
  composerField: { gap: 6 },
  composerFieldLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1, textTransform: 'uppercase' },
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
  signalScopeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  scopePill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  scopePillText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  followButton: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  followButtonText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  signalTagsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  signalAssetText: { fontSize: 14, fontFamily: 'Inter_700Bold', marginRight: 2 },
  signalLevels: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, marginTop: 12, paddingTop: 12 },
  levelLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', marginBottom: 4 },
  levelValue: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  ownSignalActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  smallActionButton: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  smallActionText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  field: { marginBottom: 2 },
  signalInputRow: { flexDirection: 'row', gap: 8 },
  signalSmallInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 12, fontFamily: 'Inter_400Regular' },
});
