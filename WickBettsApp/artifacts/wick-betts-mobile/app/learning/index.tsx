import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card, PrimaryButton, Screen, SectionLabel, Tag } from '@/components/WickUI';
import { SubscribePanel } from '@/components/Billing';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import {
  LEARNING_LEVELS,
  LEARNING_MODULES,
  SPECIALIZATIONS,
  TRACK_BONUS_XP,
  levelFromXp,
  type LearningLevel,
  type Specialization,
} from '@/lib/learningData';
import { blankLearningProgress, loadLearningProgress, saveLearningProgress, type LearningProgress } from '@/lib/learningStorage';

export default function LearningScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user, subscription } = useAuth();
  const isAdmin = user?.role === 'admin';
  const userId = user?.id;

  const [progress, setProgress] = useState<LearningProgress>(blankLearningProgress());
  const [hydrated, setHydrated] = useState(false);
  const [activeLevel, setActiveLevel] = useState<LearningLevel>('Beginner');
  const [celebration, setCelebration] = useState<LearningLevel | null>(null);

  const isLocked = subscription === null && !isAdmin;

  // Load progress for this member from device storage on mount / member switch.
  useEffect(() => {
    if (isLocked) return;
    let cancelled = false;
    setHydrated(false);
    void loadLearningProgress(userId).then((p) => {
      if (!cancelled) {
        setProgress(p);
        setHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId, isLocked]);

  // Persist on every change, but only once the initial load has completed —
  // otherwise the blank starting state would clobber saved progress.
  useEffect(() => {
    if (!hydrated) return;
    void saveLearningProgress(userId, progress);
  }, [userId, progress, hydrated]);

  // Reward system — congratulate the member the moment every module in a
  // track (lessons AND arcade games both count) is complete, and pay out a
  // one-time bonus.
  useEffect(() => {
    if (!hydrated) return;
    const newlyDone = LEARNING_LEVELS.filter((lvl) => {
      if (progress.completedTracks.includes(lvl)) return false;
      const inLevel = LEARNING_MODULES.filter((m) => m.level === lvl);
      return inLevel.length > 0 && inLevel.every((m) => progress.completedModules.includes(m.id));
    });
    if (newlyDone.length === 0) return;
    setProgress((prev) => ({
      ...prev,
      completedTracks: [...prev.completedTracks, ...newlyDone],
      xp: prev.xp + newlyDone.length * TRACK_BONUS_XP,
    }));
    setCelebration(newlyDone[newlyDone.length - 1]);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, progress.completedModules, progress.completedTracks]);

  // Daily streak — bump once per calendar day, reset if a day was skipped.
  useEffect(() => {
    if (!hydrated) return;
    const today = new Date().toDateString();
    setProgress((prev) => {
      if (prev.lastVisit === today) return prev;
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      const nextStreak = prev.lastVisit === yesterday ? prev.streakDays + 1 : 1;
      return { ...prev, lastVisit: today, streakDays: nextStreak };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const backRow = (
    <View style={styles.backRow}>
      <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
        <Ionicons name="arrow-back" size={21} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.backTitle, { color: colors.foreground }]}>Learning</Text>
      <View style={{ width: 42 }} />
    </View>
  );

  if (isLocked) {
    return (
      <Screen contentStyle={styles.content}>
        {backRow}
        <Card style={styles.lockedPanel}>
          <View style={[styles.lockedIcon, { backgroundColor: colors.secondary }]}>
            <Ionicons name="school-outline" size={26} color={colors.primary} />
          </View>
          <Text style={[styles.lockedTitle, { color: colors.foreground }]}>The academy is for members.</Text>
          <Text style={[styles.lockedBody, { color: colors.mutedForeground }]}>
            Every membership plan includes community access, the full Learning tab, and trade reviews. Subscribe to start the path from beginner to expert.
          </Text>
          <View style={styles.lockedAction}>
            <SubscribePanel />
          </View>
        </Card>
      </Screen>
    );
  }

  if (!hydrated) {
    return (
      <Screen contentStyle={styles.content}>
        {backRow}
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  const { level, intoLevel, forNext } = levelFromXp(progress.xp);

  // Untagged modules are foundational and always show. Tagged modules (lessons
  // AND games) only show under their own specialization, or when "All" is active.
  const matchesSpecialization = (m: (typeof LEARNING_MODULES)[number]) =>
    !m.specialization || progress.preferredSpecialization === 'all' || m.specialization === progress.preferredSpecialization;

  const visibleModules = LEARNING_MODULES.filter(matchesSpecialization);
  const modulesInLevel = visibleModules.filter((m) => m.level === activeLevel);
  const totalModules = visibleModules.length;
  const completedCount = progress.completedModules.filter((id) => visibleModules.some((m) => m.id === id)).length;

  const levelCompletion = (lvl: LearningLevel) => {
    const inLevel = visibleModules.filter((m) => m.level === lvl);
    const done = inLevel.filter((m) => progress.completedModules.includes(m.id)).length;
    return { done, total: inLevel.length };
  };

  const selectLevel = (lvl: LearningLevel) => {
    if (lvl === activeLevel) return;
    void Haptics.selectionAsync();
    setActiveLevel(lvl);
  };

  const activeSpecialization = progress.preferredSpecialization;
  const selectSpecialization = (spec: Specialization | 'all') => {
    if (spec === activeSpecialization) return;
    void Haptics.selectionAsync();
    setProgress((prev) => ({ ...prev, preferredSpecialization: spec }));
  };

  const openModule = (id: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (id === 'candle-arcade') {
      router.push('/learning/candle-arcade');
    } else if (id === 'trivia-arena') {
      router.push('/learning/trivia-arena');
    } else if (id === 'trade-bias-simulator') {
      router.push('/learning/trade-bias-simulator');
    } else if (id === 'options-strike-lab') {
      router.push('/learning/options-strike-lab');
    } else if (id === 'funded-combine-prep') {
      router.push('/learning/funded-combine-prep');
    } else {
      router.push({ pathname: '/learning/lesson', params: { id } });
    }
  };

  return (
    <Screen contentStyle={styles.content}>
      {backRow}

      <View style={[styles.hero, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Text style={[styles.heroEyebrow, { color: colors.primary }]}>THE ACADEMY</Text>
        <Text style={[styles.heroTitle, { color: colors.foreground }]}>Learn to trade,{'\n'}one level at a time.</Text>
        <Text style={[styles.heroBody, { color: colors.mutedForeground }]}>
          Beginner to expert, gamified. Read the fundamentals, master candlesticks, and prove it in the arcade.
        </Text>
      </View>

      <Card style={styles.statsCard}>
        <View style={styles.statsRow}>
          <View style={styles.statBlock}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>LEVEL</Text>
            <View style={styles.statBadgeRow}>
              <Ionicons name="star" size={13} color={colors.accent} />
              <Text style={[styles.statValue, { color: colors.foreground }]}>{level}</Text>
            </View>
          </View>
          <View style={styles.statBlock}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>STREAK</Text>
            <View style={styles.statBadgeRow}>
              <Ionicons name="flame" size={13} color="#FDBA74" />
              <Text style={[styles.statValue, { color: colors.foreground }]}>{progress.streakDays}d</Text>
            </View>
          </View>
          <View style={styles.statBlock}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>MODULES</Text>
            <View style={styles.statBadgeRow}>
              <Ionicons name="trophy" size={13} color={colors.accent} />
              <Text style={[styles.statValue, { color: colors.foreground }]}>{completedCount}/{totalModules}</Text>
            </View>
          </View>
        </View>
        <View style={{ marginTop: 14 }}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground, marginBottom: 8 }]}>XP TO NEXT LEVEL</Text>
          <View style={[styles.xpTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.xpFill, { backgroundColor: colors.primary, width: `${Math.round((intoLevel / forNext) * 100)}%` }]} />
          </View>
          <Text style={[styles.xpText, { color: colors.mutedForeground }]}>{intoLevel} / {forNext} XP</Text>
        </View>
      </Card>

      {celebration ? (
        <Card style={[styles.celebrationCard, { borderColor: colors.primary }]}>
          <View style={styles.celebrationRow}>
            <Ionicons name="trophy" size={20} color={colors.accent} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.celebrationTitle, { color: colors.foreground }]}>{celebration} track complete!</Text>
              <Text style={[styles.celebrationBody, { color: colors.mutedForeground }]}>
                Nice work — you cleared every module in the {celebration} path, lessons and arcade games alike. +{TRACK_BONUS_XP} bonus XP.
              </Text>
            </View>
            <Pressable onPress={() => setCelebration(null)} accessibilityRole="button" hitSlop={8}>
              <Ionicons name="close" size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </Card>
      ) : null}

      <SectionLabel>Choose a track</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trackRow}>
        {LEARNING_LEVELS.map((lvl) => {
          const { done, total } = levelCompletion(lvl);
          const trackDone = done === total && total > 0;
          const active = lvl === activeLevel;
          return (
            <Pressable
              key={lvl}
              onPress={() => selectLevel(lvl)}
              style={[
                styles.trackPill,
                { backgroundColor: active ? colors.primary : colors.secondary, borderColor: active ? colors.primary : colors.border },
              ]}
              accessibilityRole="button"
            >
              {trackDone ? <Ionicons name="trophy" size={11} color={active ? colors.primaryForeground : colors.accent} style={{ marginRight: 5 }} /> : null}
              <Text style={[styles.trackPillText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                {lvl} · {done}/{total}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <SectionLabel>Specialize</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.specRow}>
        <Pressable
          onPress={() => selectSpecialization('all')}
          style={[
            styles.specPill,
            { backgroundColor: activeSpecialization === 'all' ? colors.primary : colors.secondary, borderColor: activeSpecialization === 'all' ? colors.primary : colors.border },
          ]}
          accessibilityRole="button"
        >
          <Ionicons name="apps-outline" size={13} color={activeSpecialization === 'all' ? colors.primaryForeground : colors.mutedForeground} />
          <Text style={[styles.specPillText, { color: activeSpecialization === 'all' ? colors.primaryForeground : colors.foreground }]}>All</Text>
        </Pressable>
        {SPECIALIZATIONS.map((spec) => {
          const active = activeSpecialization === spec.id;
          return (
            <Pressable
              key={spec.id}
              onPress={() => selectSpecialization(spec.id)}
              style={[
                styles.specPill,
                { backgroundColor: active ? colors.primary : colors.secondary, borderColor: active ? colors.primary : colors.border },
              ]}
              accessibilityRole="button"
            >
              <Ionicons name={spec.icon} size={13} color={active ? colors.primaryForeground : colors.mutedForeground} />
              <Text style={[styles.specPillText, { color: active ? colors.primaryForeground : colors.foreground }]}>{spec.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {activeSpecialization !== 'all' ? (
        <Text style={[styles.specTagline, { color: colors.mutedForeground }]}>
          {SPECIALIZATIONS.find((s) => s.id === activeSpecialization)?.tagline}
        </Text>
      ) : null}

      <View style={styles.moduleList}>
        {modulesInLevel.map((mod) => {
          const done = progress.completedModules.includes(mod.id);
          const isGame = mod.kind === 'game';
          const bestLabel = mod.id === 'candle-arcade'
            ? `Best score: ${progress.candleGame.bestScore}/8`
            : mod.id === 'trivia-arena'
              ? `Best score: ${progress.triviaGame.bestScore}/8`
              : mod.id === 'trade-bias-simulator'
                ? `Best score: ${progress.tradeSimGame.bestScore}/8`
                : mod.id === 'options-strike-lab'
                  ? `Best score: ${progress.optionsGame.bestScore}/8`
                  : mod.id === 'funded-combine-prep'
                    ? `Best peak: $${progress.fundedGame.bestEquity.toLocaleString()} · Ready ${progress.fundedGame.timesReady}×`
                    : null;
          return (
            <Card key={mod.id} style={styles.moduleCard} onPress={() => openModule(mod.id)}>
              <View style={styles.moduleRow}>
                <View style={[styles.moduleIcon, { backgroundColor: isGame ? '#2B1D14' : colors.secondary }]}>
                  <Ionicons name={mod.icon} size={18} color={isGame ? '#FDBA74' : colors.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.moduleEyebrow, { color: colors.mutedForeground }]}>
                    {isGame ? 'ARCADE GAME' : `${mod.level.toUpperCase()} MODULE`}
                    {mod.specialization ? ` · ${SPECIALIZATIONS.find((s) => s.id === mod.specialization)?.label.toUpperCase()}` : ''}
                  </Text>
                  <Text style={[styles.moduleTitle, { color: colors.foreground }]}>{mod.title}</Text>
                  <Text style={[styles.moduleTagline, { color: colors.mutedForeground }]}>{mod.tagline}</Text>
                  <View style={styles.moduleMetaRow}>
                    {isGame ? (
                      <Text style={[styles.moduleMeta, { color: colors.mutedForeground }]}>{bestLabel}</Text>
                    ) : (
                      <Text style={[styles.moduleMeta, { color: colors.mutedForeground }]}>{mod.minutes} min · +{mod.xp} XP</Text>
                    )}
                    {done ? (
                      <View style={styles.doneTag}>
                        <Tag tone="green">Done</Tag>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.mutedForeground} />
              </View>
            </Card>
          );
        })}
      </View>

      <SectionLabel>Included with every membership</SectionLabel>
      <Card style={styles.perksCard}>
        <PerkRow icon="chatbubbles-outline" title="Community access" body="Trade ideas and discussion across the Signals, News, and Community Chat threads." />
        <PerkRow icon="school-outline" title="The full Learning tab" body="Every module and both arcade games, from beginner to expert." />
        <PerkRow icon="shield-checkmark-outline" title="Trade reviews" body="Bring real setups to Community or a mentorship call and get them looked at by the desk." />
      </Card>

      <Text style={[styles.footnote, { color: colors.mutedForeground }]}>
        Educational content only — not investment advice. Progress and scores are saved on this device.
      </Text>
    </Screen>
  );
}

function PerkRow({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }) {
  const colors = useColors();
  return (
    <View style={styles.perkRow}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[styles.perkTitle, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.perkBody, { color: colors.mutedForeground }]}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 110 },
  backRow: { minHeight: 74, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  backTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  loadingWrap: { paddingVertical: 60, alignItems: 'center' },
  lockedPanel: { alignItems: 'center', gap: 14, paddingVertical: 30, marginTop: 8 },
  lockedIcon: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  lockedTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', textAlign: 'center', letterSpacing: -0.4, paddingHorizontal: 8 },
  lockedBody: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 8, marginBottom: 4 },
  lockedAction: { alignSelf: 'stretch' },
  hero: { borderWidth: 1, borderRadius: 22, padding: 20, marginBottom: 16 },
  heroEyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.6, marginBottom: 12 },
  heroTitle: { fontSize: 26, lineHeight: 31, fontFamily: 'Inter_700Bold', letterSpacing: -0.7, marginBottom: 10 },
  heroBody: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  statsCard: { marginBottom: 16 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statBlock: { flex: 1 },
  statLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  statBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
  statValue: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  xpTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  xpFill: { height: 6, borderRadius: 3 },
  xpText: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 6 },
  celebrationCard: { borderWidth: 1.5, marginBottom: 16 },
  celebrationRow: { flexDirection: 'row', alignItems: 'flex-start' },
  celebrationTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  celebrationBody: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  trackRow: { gap: 8, paddingRight: 8, marginBottom: 16 },
  trackPill: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  trackPillText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  specRow: { gap: 8, paddingRight: 8, marginBottom: 8 },
  specPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  specPillText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  specTagline: { fontSize: 11, lineHeight: 15, fontFamily: 'Inter_400Regular', marginBottom: 16 },
  moduleList: { gap: 10, marginBottom: 22 },
  moduleCard: {},
  moduleRow: { flexDirection: 'row', alignItems: 'center' },
  moduleIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  moduleEyebrow: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 4 },
  moduleTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', marginBottom: 3 },
  moduleTagline: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginBottom: 8 },
  moduleMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  moduleMeta: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  doneTag: {},
  perksCard: { gap: 14, marginBottom: 10 },
  perkRow: { flexDirection: 'row', alignItems: 'flex-start' },
  perkTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', marginBottom: 3 },
  perkBody: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  footnote: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 14, paddingHorizontal: 12 },
});
