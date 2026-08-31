import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card, PrimaryButton, Screen } from '@/components/WickUI';
import { CandleGlyph } from '@/components/CandleGlyph';
import { LessonDiagram } from '@/components/LessonDiagram';
import { RichText } from '@/components/RichText';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { CANDLE_PATTERNS, LEARNING_MODULES, type LessonBlock } from '@/lib/learningData';
import { loadLearningProgress, saveLearningProgress } from '@/lib/learningStorage';

export default function LessonScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  const userId = user?.id;
  const { id } = useLocalSearchParams<{ id: string }>();
  const moduleData = LEARNING_MODULES.find((m) => m.id === id) ?? null;

  const [completed, setCompleted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    void loadLearningProgress(userId).then((p) => {
      if (!cancelled) {
        setCompleted(p.completedModules.includes(id ?? ''));
        setHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId, id]);

  const markComplete = async () => {
    if (!moduleData || completed) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const prev = await loadLearningProgress(userId);
    if (prev.completedModules.includes(moduleData.id)) {
      setCompleted(true);
      return;
    }
    const next = { ...prev, completedModules: [...prev.completedModules, moduleData.id], xp: prev.xp + moduleData.xp };
    await saveLearningProgress(userId, next);
    setCompleted(true);
  };

  const goNext = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!moduleData) {
      router.back();
      return;
    }
    const siblings = LEARNING_MODULES.filter((m) => m.level === moduleData.level);
    const idx = siblings.findIndex((m) => m.id === moduleData.id);
    const next = siblings[idx + 1];
    if (next) {
      if (next.kind === 'game') {
        router.replace(next.id === 'candle-arcade' ? '/learning/candle-arcade' : '/learning/trivia-arena');
      } else {
        router.replace({ pathname: '/learning/lesson', params: { id: next.id } });
      }
    } else {
      router.back();
    }
  };

  const backRow = (
    <View style={styles.backRow}>
      <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
        <Ionicons name="arrow-back" size={21} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.backTitle, { color: colors.foreground }]} numberOfLines={1}>
        {moduleData?.title ?? 'Lesson'}
      </Text>
      <View style={{ width: 42 }} />
    </View>
  );

  if (!moduleData) {
    return (
      <Screen contentStyle={styles.content}>
        {backRow}
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13 }}>Lesson not found.</Text>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.content}>
      {backRow}

      <Card style={styles.headCard}>
        <View style={styles.headRow}>
          <View style={[styles.headIcon, { backgroundColor: colors.secondary }]}>
            <Ionicons name={moduleData.icon} size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.headEyebrow, { color: colors.mutedForeground }]}>{moduleData.level.toUpperCase()} MODULE</Text>
            <Text style={[styles.headTitle, { color: colors.foreground }]}>{moduleData.title}</Text>
            <Text style={[styles.headMeta, { color: colors.mutedForeground }]}>{moduleData.minutes} min read · +{moduleData.xp} XP</Text>
          </View>
        </View>
      </Card>

      <View style={styles.body}>
        {(moduleData.body ?? []).map((block, i) => (
          <LessonBlockView key={i} block={block} />
        ))}
      </View>

      {moduleData.videos && moduleData.videos.length > 0 ? (
        <View style={styles.videos}>
          <Text style={[styles.videosEyebrow, { color: colors.mutedForeground }]}>WATCH INSTEAD (OPTIONAL, UNDER 10 MIN)</Text>
          {moduleData.videos.map((v) => (
            <Pressable
              key={v.url}
              onPress={() => void Linking.openURL(v.url)}
              style={[styles.videoChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              accessibilityRole="button"
            >
              <Ionicons name="play-circle-outline" size={16} color={colors.accent} />
              <Text style={[styles.videoChipText, { color: colors.foreground }]} numberOfLines={2}>{v.title}</Text>
              <Text style={[styles.videoChipDuration, { color: colors.mutedForeground }]}>{v.duration}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        {!hydrated ? (
          <ActivityIndicator color={colors.primary} />
        ) : completed ? (
          <View style={[styles.completedPill, { backgroundColor: colors.secondary }]}>
            <Ionicons name="checkmark-circle" size={14} color="#7AE2AA" />
            <Text style={[styles.completedText, { color: '#7AE2AA' }]}>Completed</Text>
          </View>
        ) : (
          <PrimaryButton onPress={() => void markComplete()} icon="checkmark-outline">Mark complete</PrimaryButton>
        )}
        <Pressable onPress={goNext} style={[styles.nextButton, { borderColor: colors.border }]} accessibilityRole="button">
          <Text style={[styles.nextButtonText, { color: colors.foreground }]}>Next lesson</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.foreground} />
        </Pressable>
      </View>
    </Screen>
  );
}

function LessonBlockView({ block }: { block: LessonBlock }) {
  const colors = useColors();
  switch (block.type) {
    case 'p':
      return <RichText text={block.text} style={[styles.paragraph, { color: colors.mutedForeground }]} boldStyle={{ color: colors.foreground }} />;
    case 'h3':
      return <Text style={[styles.h3, { color: colors.foreground }]}>{block.text}</Text>;
    case 'callout':
      return (
        <View style={[styles.callout, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Text style={[styles.calloutLabel, { color: colors.primary }]}>{block.label.toUpperCase()}</Text>
          <RichText text={block.text} style={[styles.calloutText, { color: colors.foreground }]} boldStyle={{ color: colors.accent }} />
        </View>
      );
    case 'note':
      return <Text style={[styles.note, { color: colors.mutedForeground }]}>{block.text}</Text>;
    case 'scenario':
      return (
        <View style={[styles.scenario, { backgroundColor: colors.card, borderColor: colors.primary }]}>
          <View style={styles.scenarioHead}>
            <Ionicons name="flask-outline" size={14} color={colors.primary} />
            <Text style={[styles.scenarioEyebrow, { color: colors.primary }]}>REAL-WORLD SCENARIO</Text>
          </View>
          <Text style={[styles.scenarioTitle, { color: colors.foreground }]}>{block.title}</Text>
          <Text style={[styles.scenarioLabel, { color: colors.mutedForeground }]}>THE SETUP</Text>
          <Text style={[styles.scenarioText, { color: colors.mutedForeground }]}>{block.setup}</Text>
          <Text style={[styles.scenarioLabel, { color: colors.mutedForeground }]}>WHAT HAPPENED</Text>
          <Text style={[styles.scenarioText, { color: colors.mutedForeground }]}>{block.whatHappened}</Text>
          <Text style={[styles.scenarioLabel, { color: colors.accent }]}>THE TAKEAWAY</Text>
          <Text style={[styles.scenarioTakeaway, { color: colors.foreground }]}>{block.takeaway}</Text>
        </View>
      );
    case 'list':
      return (
        <View style={styles.list}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.listRow}>
              <View style={[styles.listDot, { backgroundColor: colors.accent }]} />
              <RichText text={item} style={[styles.listText, { color: colors.mutedForeground }]} boldStyle={{ color: colors.foreground }} />
            </View>
          ))}
        </View>
      );
    case 'definitions':
      return (
        <View style={styles.defGrid}>
          {block.items.map((d, i) => (
            <View key={i} style={[styles.defCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.defTitle, { color: colors.foreground }]}>{d.title}</Text>
              <RichText text={d.text} style={[styles.defText, { color: colors.mutedForeground }]} boldStyle={{ color: colors.foreground }} />
            </View>
          ))}
        </View>
      );
    case 'timeline':
      return (
        <View style={styles.timeline}>
          {block.items.map((t, i) => (
            <View key={i} style={styles.timelineRow}>
              <Text style={[styles.timelineYear, { color: colors.primary }]}>{t.year}</Text>
              <RichText text={t.text} style={[styles.timelineText, { color: colors.mutedForeground }]} boldStyle={{ color: colors.foreground }} />
            </View>
          ))}
        </View>
      );
    case 'bios':
      return (
        <View style={styles.bioGrid}>
          {block.items.map((b, i) => (
            <View key={i} style={[styles.bioCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.bioName, { color: colors.foreground }]}>{b.name}</Text>
              <Text style={[styles.bioMeta, { color: colors.primary }]}>{b.meta}</Text>
              <RichText text={b.text} style={[styles.bioText, { color: colors.mutedForeground }]} boldStyle={{ color: colors.foreground }} />
            </View>
          ))}
        </View>
      );
    case 'candles':
      return (
        <View style={styles.candleGrid}>
          {CANDLE_PATTERNS.map((p) => (
            <View key={p.id} style={[styles.candleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.candleStage}>
                <CandleGlyph candles={p.candles} />
              </View>
              <View style={styles.candleHead}>
                <Text style={[styles.candleName, { color: colors.foreground }]}>{p.name}</Text>
                <View style={[styles.biasPill, { backgroundColor: biasBg(p.bias) }]}>
                  <Text style={[styles.biasPillText, { color: biasFg(p.bias) }]}>{p.bias}</Text>
                </View>
              </View>
              <Text style={[styles.candleRole, { color: colors.mutedForeground }]}>{p.role}</Text>
              <Text style={[styles.candleMeaning, { color: colors.mutedForeground }]}>{p.meaning}</Text>
            </View>
          ))}
        </View>
      );
    case 'diagram':
      return (
        <View style={[styles.candleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.candleStage}>
            <LessonDiagram kind={block.kind} />
          </View>
          {block.caption ? (
            <Text style={[styles.diagramCaption, { color: colors.mutedForeground }]}>{block.caption}</Text>
          ) : null}
        </View>
      );
    default:
      return null;
  }
}

function biasBg(bias: 'Bullish' | 'Bearish' | 'Neutral'): string {
  if (bias === 'Bullish') return '#11271E';
  if (bias === 'Bearish') return '#2B1418';
  return '#171321';
}
function biasFg(bias: 'Bullish' | 'Bearish' | 'Neutral'): string {
  if (bias === 'Bullish') return '#7AE2AA';
  if (bias === 'Bearish') return '#FB7185';
  return '#A59DB3';
}

const styles = StyleSheet.create({
  content: { paddingBottom: 110 },
  backRow: { minHeight: 74, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  backTitle: { flex: 1, fontSize: 15, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  headCard: { marginBottom: 18 },
  headRow: { flexDirection: 'row', alignItems: 'center' },
  headIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  headEyebrow: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 4 },
  headTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  headMeta: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  body: { gap: 14, marginBottom: 8 },
  paragraph: { fontSize: 13, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  h3: { fontSize: 15, fontFamily: 'Inter_700Bold', marginTop: 6 },
  callout: { borderWidth: 1, borderRadius: 14, padding: 14 },
  calloutLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 6 },
  calloutText: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular' },
  note: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', fontStyle: 'italic' },
  scenario: { borderWidth: 1, borderRadius: 14, padding: 14 },
  scenarioHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  scenarioEyebrow: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  scenarioTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', marginBottom: 10 },
  scenarioLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, marginBottom: 4, marginTop: 8 },
  scenarioText: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  scenarioTakeaway: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_600SemiBold' },
  list: { gap: 8 },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  listDot: { width: 5, height: 5, borderRadius: 3, marginTop: 7 },
  listText: { flex: 1, fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular' },
  defGrid: { gap: 10 },
  defCard: { borderWidth: 1, borderRadius: 14, padding: 14 },
  defTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', marginBottom: 5 },
  defText: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  timeline: { gap: 12 },
  timelineRow: { flexDirection: 'row', gap: 12 },
  timelineYear: { width: 52, fontSize: 12, fontFamily: 'Inter_700Bold' },
  timelineText: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  bioGrid: { gap: 10 },
  bioCard: { borderWidth: 1, borderRadius: 14, padding: 14 },
  bioName: { fontSize: 13, fontFamily: 'Inter_700Bold', marginBottom: 3 },
  bioMeta: { fontSize: 10, fontFamily: 'Inter_600SemiBold', marginBottom: 7 },
  bioText: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  candleGrid: { gap: 10 },
  candleCard: { borderWidth: 1, borderRadius: 14, padding: 14 },
  candleStage: { alignItems: 'center', marginBottom: 10, paddingVertical: 6 },
  candleHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  candleName: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  biasPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  biasPillText: { fontSize: 9, fontFamily: 'Inter_700Bold', textTransform: 'uppercase' },
  candleRole: { fontSize: 10, fontFamily: 'Inter_600SemiBold', marginBottom: 6 },
  candleMeaning: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  diagramCaption: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', textAlign: 'center', fontStyle: 'italic' },
  videos: { marginTop: 20, gap: 8 },
  videosEyebrow: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 2 },
  videoChip: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  videoChipText: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium' },
  videoChipDuration: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  actions: { marginTop: 22, gap: 10 },
  completedPill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 52, borderRadius: 15 },
  completedText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  nextButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 15, borderWidth: 1 },
  nextButtonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
