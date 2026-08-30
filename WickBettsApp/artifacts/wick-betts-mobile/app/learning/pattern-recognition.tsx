import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card, PrimaryButton, Screen } from '@/components/WickUI';
import { PatternChart, type ChartMarker } from '@/components/PatternChart';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { shuffleArr } from '@/lib/learningData';
import { PATTERN_SNAPSHOTS, type PatternSnapshot } from '@/lib/patternSnapshots';
import { loadLearningProgress, saveLearningProgress, type LearningProgress } from '@/lib/learningStorage';

const ROUNDS = PATTERN_SNAPSHOTS.length;
const LETTERS = ['A', 'B', 'C'];

type TimingChoice = 'early' | 'retest' | 'late';
const TIMING_OPTIONS: { value: TimingChoice; label: string }[] = [
  { value: 'early', label: 'As soon as the shape looks like it might be forming — before anything confirms' },
  { value: 'retest', label: 'After price breaks the neckline and comes back to retest it' },
  { value: 'late', label: 'After the move is already well underway and obvious to everyone' },
];

function swingQuestion(p: PatternSnapshot): string {
  if (p.patternType === 'Head & Shoulders') return 'Which point is the head — the one thing that makes this a Head & Shoulders and not just three random peaks?';
  if (p.patternType === 'Double Top') return 'Which point is the one that actually confirms the Double Top?';
  return 'Which point is the one that actually confirms the Double Bottom?';
}

interface RoundChoice { index: number; letter: string }

export default function PatternRecognitionScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  const userId = user?.id;

  const [prevProgress, setPrevProgress] = useState<LearningProgress | null>(null);
  const [order] = useState<PatternSnapshot[]>(() => shuffleArr(PATTERN_SNAPSHOTS));
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<'swing' | 'timing' | 'reveal'>('swing');
  const [swingPick, setSwingPick] = useState<number | null>(null);
  const [timingPick, setTimingPick] = useState<TimingChoice | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreakThisRun, setBestStreakThisRun] = useState(0);
  const [finished, setFinished] = useState(false);
  const [savedXp, setSavedXp] = useState(0);
  const [saved, setSaved] = useState(false);

  const current = order[round];

  const choices: RoundChoice[] = useMemo(() => {
    if (!current) return [];
    const shuffledIndices = shuffleArr([current.keyPointIndex, ...current.decoyIndices]);
    return shuffledIndices.map((index, i) => ({ index, letter: LETTERS[i] ?? String(i + 1) }));
  }, [current]);

  useEffect(() => {
    void loadLearningProgress(userId).then(setPrevProgress);
  }, [userId]);

  const swingCorrect = swingPick !== null && current ? swingPick === current.keyPointIndex : false;
  const timingCorrect = timingPick !== null && current ? timingPick === current.correctEntryTiming : false;

  const pickSwing = (index: number) => {
    if (swingPick !== null || !current) return;
    setSwingPick(index);
    void Haptics.notificationAsync(index === current.keyPointIndex ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    setPhase('timing');
  };

  const pickTiming = (value: TimingChoice) => {
    if (timingPick !== null || !current) return;
    setTimingPick(value);
    const correct = value === current.correctEntryTiming;
    void Haptics.notificationAsync(correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    const roundCorrect = swingCorrect && correct;
    if (roundCorrect) {
      setScore((s) => s + 1);
      setStreak((s) => {
        const next = s + 1;
        setBestStreakThisRun((b) => Math.max(b, next));
        return next;
      });
    } else {
      setStreak(0);
    }
    setPhase('reveal');
  };

  const nextRound = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (round + 1 >= order.length) {
      setFinished(true);
      return;
    }
    setRound((r) => r + 1);
    setPhase('swing');
    setSwingPick(null);
    setTimingPick(null);
  };

  useEffect(() => {
    if (!finished || saved) return;
    const xpEarned = score * 12 + bestStreakThisRun * 6;
    setSavedXp(xpEarned);
    setSaved(true);
    void (async () => {
      const prev = await loadLearningProgress(userId);
      const next: LearningProgress = {
        ...prev,
        xp: prev.xp + xpEarned,
        completedModules: prev.completedModules.includes('pattern-recognition')
          ? prev.completedModules
          : [...prev.completedModules, 'pattern-recognition'],
        patternGame: {
          bestScore: Math.max(prev.patternGame.bestScore, score),
          bestStreak: Math.max(prev.patternGame.bestStreak, bestStreakThisRun),
          plays: prev.patternGame.plays + 1,
        },
      };
      await saveLearningProgress(userId, next);
      setPrevProgress(next);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const playAgain = () => {
    setRound(0);
    setPhase('swing');
    setSwingPick(null);
    setTimingPick(null);
    setScore(0);
    setStreak(0);
    setBestStreakThisRun(0);
    setFinished(false);
    setSaved(false);
  };

  const backRow = (
    <View style={styles.backRow}>
      <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
        <Ionicons name="arrow-back" size={21} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.backTitle, { color: colors.foreground }]}>Pattern Recognition Trainer</Text>
      <View style={{ width: 42 }} />
    </View>
  );

  if (finished) {
    return (
      <Screen contentStyle={styles.content}>
        {backRow}
        <Card style={styles.recapCard}>
          <Ionicons name={score >= Math.ceil(ROUNDS * 0.7) ? 'trophy' : 'stats-chart'} size={30} color={score >= Math.ceil(ROUNDS * 0.7) ? '#7AE2AA' : colors.primary} />
          <Text style={[styles.recapTitle, { color: colors.foreground }]}>You scored {score}/{ROUNDS}</Text>
          <Text style={[styles.recapBody, { color: colors.mutedForeground }]}>
            Best streak this run: {bestStreakThisRun}. Every chart here was built by hand to clearly show one pattern — real charts are messier, so the goal isn't memorizing shapes, it's training your eye on WHERE inside the shape the pattern actually confirms.
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
              Personal best: {Math.max(prevProgress.patternGame.bestScore, score)}/{ROUNDS} · Best streak {Math.max(prevProgress.patternGame.bestStreak, bestStreakThisRun)}
            </Text>
          ) : null}
        </Card>
      </Screen>
    );
  }

  if (!current) return null;

  const markers: ChartMarker[] = choices.map((c) => {
    let state: ChartMarker['state'] = 'default';
    if (swingPick !== null) {
      if (c.index === current.keyPointIndex) state = 'correct';
      else if (c.index === swingPick) state = 'incorrect';
    }
    return { index: c.index, label: c.letter, state };
  });

  return (
    <Screen contentStyle={styles.content}>
      {backRow}
      <View style={[styles.simBadge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Ionicons name="flask-outline" size={12} color={colors.primary} />
        <Text style={[styles.simBadgeText, { color: colors.mutedForeground }]}>
          Hand-built practice charts, not real historical price data — built specifically to isolate one pattern at a time
        </Text>
      </View>

      <Card style={styles.gameCard}>
        <View style={styles.topbar}>
          <Text style={[styles.topbarLabel, { color: colors.mutedForeground }]}>ROUND {round + 1}/{ROUNDS} · {current.patternType.toUpperCase()}</Text>
          <View style={styles.topbarStat}>
            <Ionicons name="trophy-outline" size={12} color={colors.accent} />
            <Text style={[styles.topbarStatText, { color: colors.foreground }]}>{score}</Text>
          </View>
          <View style={styles.topbarStat}>
            <Ionicons name="flame-outline" size={12} color="#FDBA74" />
            <Text style={[styles.topbarStatText, { color: colors.foreground }]}>{streak}</Text>
          </View>
        </View>

        <Text style={[styles.tickerLabel, { color: colors.mutedForeground }]}>{current.ticker} · {current.timeframe} (simulated)</Text>

        <View style={styles.chartWrap}>
          <PatternChart candles={current.candles} markers={markers} height={150} />
        </View>

        {phase === 'swing' ? (
          <>
            <Text style={[styles.prompt, { color: colors.foreground }]}>{swingQuestion(current)}</Text>
            <View style={styles.optionsRow}>
              {choices.map((c) => (
                <Pressable
                  key={c.letter}
                  onPress={() => pickSwing(c.index)}
                  style={[styles.letterOption, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.letterOptionText, { color: colors.foreground }]}>{c.letter}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {phase === 'timing' ? (
          <>
            <Text style={[styles.swingResultText, { color: swingCorrect ? '#7AE2AA' : '#FB7185' }]}>
              {swingCorrect ? `Correct — that's ${current.keyPointLabel}.` : `Not quite — the confirming point was ${current.keyPointLabel}.`}
            </Text>
            <Text style={[styles.prompt, { color: colors.foreground }]}>Once this pattern completes, when's the highest-quality entry?</Text>
            <View style={styles.timingOptions}>
              {TIMING_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => pickTiming(opt.value)}
                  style={[styles.timingOption, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.timingOptionText, { color: colors.foreground }]}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {phase === 'reveal' ? (
          <>
            <Text style={[styles.swingResultText, { color: swingCorrect ? '#7AE2AA' : '#FB7185' }]}>
              Swing point: {swingCorrect ? 'correct' : 'incorrect'}
            </Text>
            <Text style={[styles.swingResultText, { color: timingCorrect ? '#7AE2AA' : '#FB7185' }]}>
              Entry timing: {timingCorrect ? 'correct' : 'incorrect'} — the honest answer here is usually "after the retest," not the first or the last option.
            </Text>
            <Text style={[styles.explain, { color: colors.mutedForeground }]}>{current.explanation}</Text>
            <Pressable onPress={nextRound} style={[styles.nextButton, { backgroundColor: colors.secondary }]} accessibilityRole="button">
              <Text style={[styles.nextButtonText, { color: colors.foreground }]}>{round + 1 >= order.length ? 'See results' : 'Next chart'}</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.foreground} />
            </Pressable>
          </>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 110 },
  backRow: { minHeight: 74, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  backTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', flexShrink: 1, textAlign: 'center' },
  simBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 16 },
  simBadgeText: { flex: 1, fontSize: 10, lineHeight: 14, fontFamily: 'Inter_500Medium' },
  gameCard: {},
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 6 },
  topbarLabel: { flex: 1, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  topbarStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  topbarStatText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  tickerLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', marginBottom: 10 },
  chartWrap: { alignItems: 'center', paddingVertical: 10, marginBottom: 6 },
  prompt: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_600SemiBold', marginTop: 10, marginBottom: 14 },
  optionsRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  letterOption: { width: 56, height: 56, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  letterOptionText: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  swingResultText: { fontSize: 12, fontFamily: 'Inter_700Bold', marginBottom: 8 },
  timingOptions: { gap: 10 },
  timingOption: { minHeight: 54, borderWidth: 1, borderRadius: 13, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  timingOptionText: { fontSize: 12.5, lineHeight: 17, fontFamily: 'Inter_500Medium' },
  explain: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', marginTop: 4, marginBottom: 4 },
  nextButton: { marginTop: 14, minHeight: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  nextButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  recapCard: { alignItems: 'center', paddingVertical: 30, gap: 6 },
  recapTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginTop: 8 },
  recapBody: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 12 },
  xpPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 8 },
  xpPillText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  recapFootnote: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 16, textAlign: 'center' },
});
