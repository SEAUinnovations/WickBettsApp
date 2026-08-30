import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card, PrimaryButton, Screen } from '@/components/WickUI';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { loadLearningProgress, saveLearningProgress, type LearningProgress } from '@/lib/learningStorage';

// Portfolio Allocation Builder — a gamified take on portfolio-perspective
// risk management: split a paper $10,000 across cash, options, and
// long-term holds, then see how that split actually performs across a
// randomized market scenario (Calm / Rally / Crash) you don't get to pick
// in advance, the same "you don't know what's coming" idea Funded Combine
// Prep already uses. There is no single "correct" split — see the reveal
// copy in `scoreAllocation` below — the game is about feeling the tradeoff,
// not memorizing one right answer.

const STARTING_CAPITAL = 10_000;
const STEP = 5; // percentage-point increment per tap — no slider dependency needed
const ROUNDS = 4;

type Bucket = 'cash' | 'options' | 'longTermHolds';

interface Preset { id: string; label: string; blurb: string; cash: number; options: number; longTermHolds: number }

// The three concrete frameworks named in the product ask, plus the
// all-cash baseline used as the "what would doing nothing have done"
// comparison in the reveal.
const PRESETS: Preset[] = [
  { id: 'cash-heavy', label: 'Cash-heavy · 80/20', blurb: 'Maximum dry powder, minimum blow-up risk.', cash: 80, options: 20, longTermHolds: 0 },
  { id: 'balanced', label: 'Balanced · 60/40', blurb: 'A common middle-ground split.', cash: 60, options: 40, longTermHolds: 0 },
  { id: 'three-way', label: 'Three-way · 40/20/40', blurb: 'Cash, long-term holds, and options each play a role.', cash: 40, options: 40, longTermHolds: 20 },
];

type ScenarioType = 'Calm' | 'Rally' | 'Crash';
interface ScenarioResult { type: ScenarioType; blurb: string; returns: Record<Bucket, number> }

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// Cash is deliberately almost flat in every scenario — that is the entire
// point of holding it. Options carry real leverage both ways: they are the
// best performer in a Rally and the worst in a Crash, by a wide margin.
// Long-term holds sit in between — real equity exposure, no leverage.
function rollScenario(): ScenarioResult {
  const roll = Math.random();
  if (roll < 0.34) {
    return {
      type: 'Calm',
      blurb: 'A quiet, rangebound stretch — no big move either way.',
      returns: { cash: randBetween(0.1, 0.3), options: randBetween(-15, -3), longTermHolds: randBetween(1, 4) },
    };
  }
  if (roll < 0.67) {
    return {
      type: 'Rally',
      blurb: 'A strong, sustained move higher across the board.',
      returns: { cash: randBetween(0.1, 0.3), options: randBetween(60, 120), longTermHolds: randBetween(14, 24) },
    };
  }
  return {
    type: 'Crash',
    blurb: 'A sharp, fast drawdown hits the market.',
    returns: { cash: randBetween(0.1, 0.3), options: randBetween(-95, -68), longTermHolds: randBetween(-34, -22) },
  };
}

function applyAllocation(alloc: Record<Bucket, number>, returns: Record<Bucket, number>): number {
  const cashValue = (STARTING_CAPITAL * (alloc.cash / 100)) * (1 + returns.cash / 100);
  const optionsValue = (STARTING_CAPITAL * (alloc.options / 100)) * (1 + returns.options / 100);
  const ltValue = (STARTING_CAPITAL * (alloc.longTermHolds / 100)) * (1 + returns.longTermHolds / 100);
  return cashValue + optionsValue + ltValue;
}

// A round's score rewards surviving the downside more than it rewards
// chasing the upside — deliberately, since the product point of this game
// is risk management, not return-maximizing. A total wipeout is scored
// near zero regardless of scenario; a portfolio that barely dents in a
// Crash scores well even though an all-options portfolio would have "won"
// a Rally by a wider margin.
function scoreRound(finalValue: number, scenario: ScenarioType): number {
  const pctChange = ((finalValue - STARTING_CAPITAL) / STARTING_CAPITAL) * 100;
  if (scenario === 'Crash') {
    // Losing less is what "winning" a Crash round means.
    if (pctChange >= -5) return 100;
    if (pctChange <= -60) return 5;
    return Math.round(100 - ((pctChange + 5) / -55) * 95);
  }
  // Calm / Rally: reward genuine growth, but cap the credit for extreme
  // upside so an all-options bet in a Rally doesn't automatically "win" —
  // it still scores very well, just not at the expense of the lesson.
  if (pctChange <= 0) return Math.max(10, Math.round(50 + pctChange));
  return Math.min(100, Math.round(55 + pctChange));
}

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

export default function PortfolioAllocationBuilderScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  const userId = user?.id;

  const [prevProgress, setPrevProgress] = useState<LearningProgress | null>(null);
  const [round, setRound] = useState(1);
  const [alloc, setAlloc] = useState<Record<Bucket, number>>({ cash: 100, options: 0, longTermHolds: 0 });
  const [result, setResult] = useState<{ scenario: ScenarioResult; finalValue: number; score: number; allCashValue: number } | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const [savedXp, setSavedXp] = useState(0);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadLearningProgress(userId).then(setPrevProgress);
  }, [userId]);

  const total = alloc.cash + alloc.options + alloc.longTermHolds;
  const remaining = 100 - total;

  const adjust = (bucket: Bucket, delta: number) => {
    if (result) return;
    setAlloc((prev) => {
      const current = prev[bucket];
      if (delta > 0 && remaining < delta) return prev;
      if (delta < 0 && current + delta < 0) return prev;
      return { ...prev, [bucket]: current + delta };
    });
    void Haptics.selectionAsync();
  };

  const applyPreset = (preset: Preset) => {
    if (result) return;
    setAlloc({ cash: preset.cash, options: preset.options, longTermHolds: preset.longTermHolds });
    void Haptics.selectionAsync();
  };

  const runScenario = () => {
    if (total !== 100 || result) return;
    const scenario = rollScenario();
    const finalValue = applyAllocation(alloc, scenario.returns);
    const allCashValue = applyAllocation({ cash: 100, options: 0, longTermHolds: 0 }, scenario.returns);
    const score = scoreRound(finalValue, scenario.type);
    setResult({ scenario, finalValue, score, allCashValue });
    setScores((s) => [...s, score]);
    void Haptics.notificationAsync(finalValue >= STARTING_CAPITAL ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
  };

  const nextRound = () => {
    if (round >= ROUNDS) {
      setFinished(true);
      return;
    }
    setRound((r) => r + 1);
    setResult(null);
    setAlloc({ cash: 100, options: 0, longTermHolds: 0 });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  useEffect(() => {
    if (!finished || saved) return;
    const xpEarned = Math.max(0, 30 + Math.round(avgScore * 0.8) + (avgScore >= 80 ? 40 : 0));
    setSavedXp(xpEarned);
    setSaved(true);
    void (async () => {
      const prev = await loadLearningProgress(userId);
      const next: LearningProgress = {
        ...prev,
        xp: prev.xp + xpEarned,
        completedModules: prev.completedModules.includes('portfolio-allocation-builder')
          ? prev.completedModules
          : [...prev.completedModules, 'portfolio-allocation-builder'],
        portfolioBuilderGame: {
          bestScore: Math.max(prev.portfolioBuilderGame.bestScore, avgScore),
          plays: prev.portfolioBuilderGame.plays + 1,
        },
      };
      await saveLearningProgress(userId, next);
      setPrevProgress(next);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const playAgain = () => {
    setRound(1);
    setAlloc({ cash: 100, options: 0, longTermHolds: 0 });
    setResult(null);
    setScores([]);
    setFinished(false);
    setSaved(false);
  };

  const backRow = (
    <View style={styles.backRow}>
      <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
        <Ionicons name="arrow-back" size={21} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.backTitle, { color: colors.foreground }]}>Portfolio Allocation Builder</Text>
      <View style={{ width: 42 }} />
    </View>
  );

  if (finished) {
    return (
      <Screen contentStyle={styles.content}>
        {backRow}
        <Card style={styles.recapCard}>
          <Ionicons name={avgScore >= 70 ? 'trophy' : 'stats-chart'} size={30} color={avgScore >= 70 ? '#7AE2AA' : colors.primary} />
          <Text style={[styles.recapTitle, { color: colors.foreground }]}>Average score: {avgScore}/100</Text>
          <Text style={[styles.recapBody, { color: colors.mutedForeground }]}>
            Across {ROUNDS} randomized scenarios, no single allocation "won" every round — that is the actual lesson, not a bug in the game. Cash protects you in a Crash and gives up upside in a Rally; options do the opposite, with far more extreme swings either way.
          </Text>
          <View style={[styles.xpPill, { backgroundColor: colors.secondary }]}>
            <Ionicons name="flash" size={12} color="#FDBA74" />
            <Text style={[styles.xpPillText, { color: '#FDBA74' }]}>+{savedXp} XP earned</Text>
          </View>
          <View style={{ marginTop: 20, alignSelf: 'stretch' }}>
            <PrimaryButton onPress={playAgain} icon="refresh-outline">Run it back</PrimaryButton>
          </View>
          {prevProgress ? (
            <Text style={[styles.recapFootnote, { color: colors.mutedForeground }]}>
              Best average score: {Math.max(prevProgress.portfolioBuilderGame.bestScore, avgScore)}/100
            </Text>
          ) : null}
        </Card>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.content}>
      {backRow}
      <View style={[styles.simBadge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Ionicons name="flask-outline" size={12} color={colors.primary} />
        <Text style={[styles.simBadgeText, { color: colors.mutedForeground }]}>
          Simulated scenarios, not real market data or financial advice — there is no single correct split for every account
        </Text>
      </View>

      <Card style={styles.progressCard}>
        <View style={styles.progressHead}>
          <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>ROUND {round}/{ROUNDS}</Text>
          <Text style={[styles.progressEquity, { color: colors.foreground }]}>Starting capital: {money(STARTING_CAPITAL)}</Text>
        </View>
      </Card>

      <Card style={styles.gameCard}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>QUICK PRESETS</Text>
        <View style={styles.presetRow}>
          {PRESETS.map((preset) => (
            <Pressable
              key={preset.id}
              onPress={() => applyPreset(preset)}
              disabled={Boolean(result)}
              style={[styles.presetChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              accessibilityRole="button"
            >
              <Text style={[styles.presetChipTitle, { color: colors.foreground }]}>{preset.label}</Text>
              <Text style={[styles.presetChipBlurb, { color: colors.mutedForeground }]}>{preset.blurb}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 18 }]}>YOUR SPLIT — {total}% allocated{remaining !== 0 ? ` (${remaining}% left)` : ''}</Text>
        {(['cash', 'options', 'longTermHolds'] as Bucket[]).map((bucket) => (
          <View key={bucket} style={styles.bucketRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bucketLabel, { color: colors.foreground }]}>
                {bucket === 'cash' ? 'Cash' : bucket === 'options' ? 'Options' : 'Long-term holds'}
              </Text>
              <Text style={[styles.bucketValue, { color: colors.mutedForeground }]}>
                {alloc[bucket]}% · {money(STARTING_CAPITAL * (alloc[bucket] / 100))}
              </Text>
            </View>
            <Pressable
              onPress={() => adjust(bucket, -STEP)}
              disabled={Boolean(result) || alloc[bucket] <= 0}
              style={[styles.stepButton, { borderColor: colors.border, opacity: result || alloc[bucket] <= 0 ? 0.4 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={`Decrease ${bucket}`}
            >
              <Ionicons name="remove" size={16} color={colors.foreground} />
            </Pressable>
            <Pressable
              onPress={() => adjust(bucket, STEP)}
              disabled={Boolean(result) || remaining < STEP}
              style={[styles.stepButton, { borderColor: colors.border, opacity: result || remaining < STEP ? 0.4 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={`Increase ${bucket}`}
            >
              <Ionicons name="add" size={16} color={colors.foreground} />
            </Pressable>
          </View>
        ))}

        {!result ? (
          <View style={{ marginTop: 16 }}>
            {total === 100 ? (
              <PrimaryButton onPress={runScenario} icon="dice-outline">Run this scenario</PrimaryButton>
            ) : (
              <View style={[styles.disabledButton, { backgroundColor: colors.muted }]}>
                <Text style={[styles.disabledButtonText, { color: colors.mutedForeground }]}>
                  Allocate the remaining {remaining}%
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View style={{ marginTop: 16 }}>
            <View style={[styles.resultBanner, { backgroundColor: result.finalValue >= STARTING_CAPITAL ? '#11271E' : '#2B1418', borderColor: result.finalValue >= STARTING_CAPITAL ? '#7AE2AA' : '#FB7185' }]}>
              <Ionicons name={result.scenario.type === 'Crash' ? 'thunderstorm-outline' : result.scenario.type === 'Rally' ? 'trending-up' : 'partly-sunny-outline'} size={16} color={result.finalValue >= STARTING_CAPITAL ? '#7AE2AA' : '#FB7185'} />
              <Text style={[styles.resultText, { color: result.finalValue >= STARTING_CAPITAL ? '#7AE2AA' : '#FB7185' }]}>
                {result.scenario.type}: {result.scenario.blurb}
              </Text>
            </View>
            <Text style={[styles.resultDetail, { color: colors.foreground }]}>
              Your portfolio: {money(result.finalValue)} ({pct(((result.finalValue - STARTING_CAPITAL) / STARTING_CAPITAL) * 100)}) · Score {result.score}/100
            </Text>
            <Text style={[styles.resultCompare, { color: colors.mutedForeground }]}>
              An all-cash portfolio would have landed at {money(result.allCashValue)} ({pct(((result.allCashValue - STARTING_CAPITAL) / STARTING_CAPITAL) * 100)}) this same round.
            </Text>
            <Pressable onPress={nextRound} style={[styles.nextButton, { backgroundColor: colors.secondary }]} accessibilityRole="button">
              <Text style={[styles.nextButtonText, { color: colors.foreground }]}>{round >= ROUNDS ? 'See results' : 'Next round'}</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.foreground} />
            </Pressable>
          </View>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 110 },
  backRow: { minHeight: 74, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  backTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  simBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 16 },
  simBadgeText: { flex: 1, fontSize: 10, lineHeight: 14, fontFamily: 'Inter_500Medium' },
  progressCard: { marginBottom: 12 },
  progressHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  progressEquity: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  gameCard: {},
  sectionLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 10 },
  presetRow: { gap: 8 },
  presetChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  presetChipTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', marginBottom: 2 },
  presetChipBlurb: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  bucketRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  bucketLabel: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  bucketValue: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  stepButton: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  disabledButton: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  disabledButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  resultBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  resultText: { flex: 1, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  resultDetail: { fontSize: 13, fontFamily: 'Inter_700Bold', marginTop: 12 },
  resultCompare: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 6 },
  nextButton: { marginTop: 14, minHeight: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  nextButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  recapCard: { alignItems: 'center', paddingVertical: 30, gap: 6 },
  recapTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginTop: 8 },
  recapBody: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 12 },
  xpPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 12 },
  xpPillText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  recapFootnote: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 16, textAlign: 'center' },
});
