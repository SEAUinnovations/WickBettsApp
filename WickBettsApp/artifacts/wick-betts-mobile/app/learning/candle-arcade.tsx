import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card, PrimaryButton, Screen } from '@/components/WickUI';
import { CandleGlyph } from '@/components/CandleGlyph';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { CANDLE_PATTERNS, sampleArr, shuffleArr, type CandlePattern } from '@/lib/learningData';
import { loadLearningProgress, saveLearningProgress, type LearningProgress } from '@/lib/learningStorage';

const ROUNDS = 8;

export default function CandleArcadeScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  const userId = user?.id;

  const [prevProgress, setPrevProgress] = useState<LearningProgress | null>(null);
  const [order, setOrder] = useState<CandlePattern[]>(() => sampleArr(CANDLE_PATTERNS, ROUNDS));
  const [round, setRound] = useState(0);
  const [options, setOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreakThisRun, setBestStreakThisRun] = useState(0);
  const [finished, setFinished] = useState(false);
  const [savedXp, setSavedXp] = useState(0);

  const current = order[round];

  useEffect(() => {
    void loadLearningProgress(userId).then(setPrevProgress);
  }, [userId]);

  useEffect(() => {
    if (!current) return;
    const distractors = sampleArr(CANDLE_PATTERNS.filter((p) => p.id !== current.id), 3).map((p) => p.name);
    setOptions(shuffleArr([current.name, ...distractors]));
    setSelected(null);
  }, [round]);

  const pick = (name: string) => {
    if (selected || !current) return;
    setSelected(name);
    const correct = name === current.name;
    if (correct) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScore((s) => s + 1);
      setStreak((s) => {
        const next = s + 1;
        setBestStreakThisRun((b) => Math.max(b, next));
        return next;
      });
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setStreak(0);
    }
  };

  const finishRound = async (finalScore: number, finalBestStreak: number) => {
    const xpEarned = finalScore * 10 + finalBestStreak * 5;
    setSavedXp(xpEarned);
    const prev = await loadLearningProgress(userId);
    const next: LearningProgress = {
      ...prev,
      xp: prev.xp + xpEarned,
      completedModules: prev.completedModules.includes('candle-arcade') ? prev.completedModules : [...prev.completedModules, 'candle-arcade'],
      candleGame: {
        bestScore: Math.max(prev.candleGame.bestScore, finalScore),
        bestStreak: Math.max(prev.candleGame.bestStreak, finalBestStreak),
        plays: prev.candleGame.plays + 1,
      },
    };
    await saveLearningProgress(userId, next);
    setPrevProgress(next);
  };

  const next = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (round + 1 >= order.length) {
      void finishRound(score, bestStreakThisRun);
      setFinished(true);
      return;
    }
    setRound((r) => r + 1);
  };

  const playAgain = () => {
    setOrder(sampleArr(CANDLE_PATTERNS, ROUNDS));
    setRound(0);
    setScore(0);
    setStreak(0);
    setBestStreakThisRun(0);
    setFinished(false);
    setSelected(null);
  };

  const backRow = (
    <View style={styles.backRow}>
      <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
        <Ionicons name="arrow-back" size={21} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.backTitle, { color: colors.foreground }]}>Candle ID Arcade</Text>
      <View style={{ width: 42 }} />
    </View>
  );

  if (finished) {
    return (
      <Screen contentStyle={styles.content}>
        {backRow}
        <Card style={styles.recapCard}>
          <Ionicons name="trophy" size={30} color={colors.accent} />
          <Text style={[styles.recapTitle, { color: colors.foreground }]}>Round complete.</Text>
          <Text style={[styles.recapBody, { color: colors.mutedForeground }]}>
            You scored <Text style={{ fontFamily: 'Inter_700Bold', color: colors.foreground }}>{score}/{order.length}</Text> with a best streak of{' '}
            <Text style={{ fontFamily: 'Inter_700Bold', color: colors.foreground }}>{bestStreakThisRun}</Text>.
          </Text>
          <View style={[styles.xpPill, { backgroundColor: colors.secondary }]}>
            <Ionicons name="flash" size={12} color="#FDBA74" />
            <Text style={[styles.xpPillText, { color: '#FDBA74' }]}>+{savedXp} XP earned</Text>
          </View>
          <View style={{ marginTop: 20, alignSelf: 'stretch' }}>
            <PrimaryButton onPress={playAgain} icon="refresh-outline">Play again</PrimaryButton>
          </View>
          {prevProgress ? (
            <Text style={[styles.recapFootnote, { color: colors.mutedForeground }]}>
              Personal best: {Math.max(prevProgress.candleGame.bestScore, score)}/{order.length} · Best streak {Math.max(prevProgress.candleGame.bestStreak, bestStreakThisRun)}
            </Text>
          ) : null}
        </Card>
      </Screen>
    );
  }

  if (!current) return null;

  return (
    <Screen contentStyle={styles.content}>
      {backRow}
      <Card style={styles.gameCard}>
        <View style={styles.topbar}>
          <Text style={[styles.topbarLabel, { color: colors.mutedForeground }]}>ROUND {round + 1}/{order.length}</Text>
          <View style={styles.topbarStat}>
            <Ionicons name="trophy-outline" size={12} color={colors.accent} />
            <Text style={[styles.topbarStatText, { color: colors.foreground }]}>{score}</Text>
          </View>
          <View style={styles.topbarStat}>
            <Ionicons name="flame-outline" size={12} color="#FDBA74" />
            <Text style={[styles.topbarStatText, { color: colors.foreground }]}>{streak}</Text>
          </View>
        </View>

        <View style={styles.stage}>
          <CandleGlyph candles={current.candles} height={130} />
        </View>
        <Text style={[styles.prompt, { color: colors.mutedForeground }]}>What pattern is this?</Text>

        <View style={styles.options}>
          {options.map((opt) => {
            const isCorrect = opt === current.name;
            const isSelected = opt === selected;
            const bg = selected
              ? isCorrect
                ? '#11271E'
                : isSelected
                  ? '#2B1418'
                  : colors.secondary
              : colors.secondary;
            const border = selected ? (isCorrect ? '#7AE2AA' : isSelected ? '#FB7185' : colors.border) : colors.border;
            const fg = selected ? (isCorrect ? '#7AE2AA' : isSelected ? '#FB7185' : colors.mutedForeground) : colors.foreground;
            return (
              <Pressable
                key={opt}
                onPress={() => pick(opt)}
                disabled={!!selected}
                style={[styles.option, { backgroundColor: bg, borderColor: border }]}
                accessibilityRole="button"
              >
                <Text style={[styles.optionText, { color: fg }]}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>

        {selected ? (
          <View style={{ marginTop: 16 }}>
            <Text style={[styles.explain, { color: colors.mutedForeground }]}>{current.meaning}</Text>
            <Pressable onPress={next} style={[styles.nextButton, { backgroundColor: colors.secondary }]} accessibilityRole="button">
              <Text style={[styles.nextButtonText, { color: colors.foreground }]}>
                {round + 1 >= order.length ? 'See results' : 'Next round'}
              </Text>
              <Ionicons name="arrow-forward" size={14} color={colors.foreground} />
            </Pressable>
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 110 },
  backRow: { minHeight: 74, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  backTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  gameCard: {},
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  topbarLabel: { flex: 1, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  topbarStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  topbarStatText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  stage: { alignItems: 'center', paddingVertical: 20 },
  prompt: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', marginBottom: 18 },
  options: { gap: 10 },
  option: { minHeight: 50, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  optionText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  explain: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  nextButton: { marginTop: 14, minHeight: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  nextButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  recapCard: { alignItems: 'center', paddingVertical: 30, gap: 6 },
  recapTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginTop: 8 },
  recapBody: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 12 },
  xpPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 8 },
  xpPillText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  recapFootnote: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 16, textAlign: 'center' },
});
