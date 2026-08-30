import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card, PrimaryButton, Screen } from '@/components/WickUI';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { loadLearningProgress, saveLearningProgress, type LearningProgress } from '@/lib/learningStorage';

// Risk-Sizing Duel — a risk-of-ruin simulator built specifically to answer
// "if you have $1,000, how much should you risk per trade, and why".
// IMPORTANT DISTINCTION this game is built to teach: "risk per trade" here
// means the fraction of your account you are willing to LOSE if your stop
// is hit — not the fraction of capital you put into the position (which,
// with a tight stop or leverage, can reasonably be much higher). Those are
// two different numbers, and conflating them is one of the most common
// beginner mistakes. The strategy simulated below has a genuine, positive
// edge (a 42% win rate at a 1.6:1 reward-to-risk ratio nets out ahead on
// average) — the game is not about whether the edge is real, it's about
// whether a given risk-per-trade size lets you survive long enough to
// actually collect it.
const STARTING_CAPITAL = 1000;
const TRADES_PER_SEQUENCE = 20;
const WIN_RATE = 0.42;
const REWARD_MULTIPLE = 1.6;
const RUIN_THRESHOLD = 0.15; // below 15% of starting capital counts as "ruined"
const SEQUENCES_PER_ROUND = 3;
const ROUNDS = 4;
const STEP = 1;
const MIN_RISK = 1;
const MAX_RISK = 30;

interface SequenceResult { finalEquity: number; ruined: boolean }

function runSequence(riskPct: number): SequenceResult {
  let equity = STARTING_CAPITAL;
  const ruinFloor = STARTING_CAPITAL * RUIN_THRESHOLD;
  for (let i = 0; i < TRADES_PER_SEQUENCE; i++) {
    if (equity <= ruinFloor) break;
    const win = Math.random() < WIN_RATE;
    const riskAmount = equity * (riskPct / 100);
    equity += win ? riskAmount * REWARD_MULTIPLE : -riskAmount;
    if (equity < 0) equity = 0;
  }
  return { finalEquity: equity, ruined: equity <= ruinFloor };
}

// Rewards both surviving AND growing the account — pure survival (risking
// almost nothing) scores decently but not perfectly; pure aggression scores
// well only when it gets lucky, and the average across many plays favors a
// moderate size, same as the real math of risk of ruin does.
function scoreRound(sequences: SequenceResult[]): number {
  const survivedCount = sequences.filter((s) => !s.ruined).length;
  const survivalScore = [0, 25, 55, 75][survivedCount] ?? 0;
  const avgMultiple = sequences.reduce((sum, s) => sum + s.finalEquity / STARTING_CAPITAL, 0) / sequences.length;
  const growthBonus = Math.max(0, Math.min(25, Math.round((avgMultiple - 1) * 40)));
  return Math.max(0, Math.min(100, survivalScore + growthBonus));
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default function RiskSizingDuelScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  const userId = user?.id;

  const [prevProgress, setPrevProgress] = useState<LearningProgress | null>(null);
  const [round, setRound] = useState(1);
  const [riskPct, setRiskPct] = useState(2);
  const [sequences, setSequences] = useState<SequenceResult[] | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const [bestMultipleThisRun, setBestMultipleThisRun] = useState(0);
  const [finished, setFinished] = useState(false);
  const [savedXp, setSavedXp] = useState(0);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadLearningProgress(userId).then(setPrevProgress);
  }, [userId]);

  const adjustRisk = (delta: number) => {
    if (sequences) return;
    setRiskPct((prev) => Math.max(MIN_RISK, Math.min(MAX_RISK, prev + delta)));
    void Haptics.selectionAsync();
  };

  const runRound = () => {
    if (sequences) return;
    const results = Array.from({ length: SEQUENCES_PER_ROUND }, () => runSequence(riskPct));
    setSequences(results);
    const score = scoreRound(results);
    setScores((s) => [...s, score]);
    const bestMultiple = Math.max(...results.map((r) => r.finalEquity / STARTING_CAPITAL));
    setBestMultipleThisRun((b) => Math.max(b, bestMultiple));
    const anyRuined = results.some((r) => r.ruined);
    void Haptics.notificationAsync(anyRuined ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
  };

  const nextRound = () => {
    if (round >= ROUNDS) {
      setFinished(true);
      return;
    }
    setRound((r) => r + 1);
    setSequences(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  useEffect(() => {
    if (!finished || saved) return;
    const xpEarned = Math.max(0, 30 + Math.round(avgScore * 0.8) + (avgScore >= 75 ? 40 : 0));
    setSavedXp(xpEarned);
    setSaved(true);
    void (async () => {
      const prev = await loadLearningProgress(userId);
      const next: LearningProgress = {
        ...prev,
        xp: prev.xp + xpEarned,
        completedModules: prev.completedModules.includes('risk-sizing-duel')
          ? prev.completedModules
          : [...prev.completedModules, 'risk-sizing-duel'],
        riskDuelGame: {
          bestFinalEquityMultiple: Math.max(prev.riskDuelGame.bestFinalEquityMultiple, bestMultipleThisRun),
          plays: prev.riskDuelGame.plays + 1,
        },
      };
      await saveLearningProgress(userId, next);
      setPrevProgress(next);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const playAgain = () => {
    setRound(1);
    setRiskPct(2);
    setSequences(null);
    setScores([]);
    setBestMultipleThisRun(0);
    setFinished(false);
    setSaved(false);
  };

  const backRow = (
    <View style={styles.backRow}>
      <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
        <Ionicons name="arrow-back" size={21} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.backTitle, { color: colors.foreground }]}>Risk-Sizing Duel</Text>
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
            The strategy simulated here has a real positive edge — the risk you chose is what decided how often that edge actually got a chance to show up, versus getting cut short by a losing streak. Very low risk survives almost every time but grows slowly; very high risk can post huge numbers, but a meaningful share of the time it ends in ruin instead.
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
              Best single sequence: {Math.max(prevProgress.riskDuelGame.bestFinalEquityMultiple, bestMultipleThisRun).toFixed(2)}x starting capital
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
          Simulated trade sequences, not real market data — a genuine positive-edge strategy, sized differently each round
        </Text>
      </View>

      <Card style={styles.progressCard}>
        <View style={styles.progressHead}>
          <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>ROUND {round}/{ROUNDS}</Text>
          <Text style={[styles.progressEquity, { color: colors.foreground }]}>Starting capital: {money(STARTING_CAPITAL)}</Text>
        </View>
      </Card>

      <Card style={styles.gameCard}>
        <Text style={[styles.explainer, { color: colors.mutedForeground }]}>
          "Risk per trade" below means how much of your account you accept losing if your stop is hit — not how much money you put into the trade. A tight stop can let you size a larger position while still only risking a small slice of your account.
        </Text>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 16 }]}>RISK PER TRADE: {riskPct}%</Text>
        <View style={styles.riskRow}>
          <Pressable
            onPress={() => adjustRisk(-STEP)}
            disabled={Boolean(sequences) || riskPct <= MIN_RISK}
            style={[styles.stepButton, { borderColor: colors.border, opacity: sequences || riskPct <= MIN_RISK ? 0.4 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Decrease risk per trade"
          >
            <Ionicons name="remove" size={18} color={colors.foreground} />
          </Pressable>
          <View style={[styles.riskTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.riskFill, { backgroundColor: riskPct <= 5 ? '#7AE2AA' : riskPct <= 15 ? '#FDBA74' : '#FB7185', width: `${((riskPct - MIN_RISK) / (MAX_RISK - MIN_RISK)) * 100}%` }]} />
          </View>
          <Pressable
            onPress={() => adjustRisk(STEP)}
            disabled={Boolean(sequences) || riskPct >= MAX_RISK}
            style={[styles.stepButton, { borderColor: colors.border, opacity: sequences || riskPct >= MAX_RISK ? 0.4 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Increase risk per trade"
          >
            <Ionicons name="add" size={18} color={colors.foreground} />
          </Pressable>
        </View>
        <Text style={[styles.riskAmountText, { color: colors.mutedForeground }]}>
          On this account, that's {money(STARTING_CAPITAL * (riskPct / 100))} at risk on the very first trade of each sequence.
        </Text>

        {!sequences ? (
          <View style={{ marginTop: 16 }}>
            <PrimaryButton onPress={runRound} icon="play-outline">
              Run {SEQUENCES_PER_ROUND} sequences of {TRADES_PER_SEQUENCE} trades
            </PrimaryButton>
          </View>
        ) : (
          <View style={{ marginTop: 16 }}>
            {sequences.map((seq, i) => {
              const multiple = seq.finalEquity / STARTING_CAPITAL;
              const barWidth = Math.min(100, (seq.finalEquity / (STARTING_CAPITAL * 2)) * 100);
              return (
                <View key={i} style={styles.sequenceRow}>
                  <Text style={[styles.sequenceLabel, { color: colors.mutedForeground }]}>Seq {i + 1}</Text>
                  <View style={[styles.sequenceTrack, { backgroundColor: colors.border }]}>
                    <View style={[styles.sequenceFill, { backgroundColor: seq.ruined ? '#FB7185' : '#7AE2AA', width: `${barWidth}%` }]} />
                  </View>
                  <Text style={[styles.sequenceValue, { color: seq.ruined ? '#FB7185' : colors.foreground }]}>
                    {seq.ruined ? 'Ruined' : `${money(seq.finalEquity)} (${multiple.toFixed(2)}x)`}
                  </Text>
                </View>
              );
            })}
            <Text style={[styles.roundSummary, { color: colors.foreground }]}>
              {sequences.filter((s) => !s.ruined).length}/{SEQUENCES_PER_ROUND} survived this round · Score {scores[scores.length - 1]}/100
            </Text>
            <Pressable onPress={nextRound} style={[styles.nextButton, { backgroundColor: colors.secondary }]} accessibilityRole="button">
              <Text style={[styles.nextButtonText, { color: colors.foreground }]}>{round >= ROUNDS ? 'See results' : 'Try a different risk size'}</Text>
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
  explainer: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  sectionLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 10 },
  riskRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepButton: { width: 38, height: 38, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  riskTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  riskFill: { height: 8, borderRadius: 4 },
  riskAmountText: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 10 },
  sequenceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sequenceLabel: { width: 42, fontSize: 10, fontFamily: 'Inter_700Bold' },
  sequenceTrack: { flex: 1, height: 14, borderRadius: 7, overflow: 'hidden' },
  sequenceFill: { height: 14, borderRadius: 7 },
  sequenceValue: { width: 108, fontSize: 11, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  roundSummary: { fontSize: 13, fontFamily: 'Inter_700Bold', marginTop: 6, textAlign: 'center' },
  nextButton: { marginTop: 14, minHeight: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  nextButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  recapCard: { alignItems: 'center', paddingVertical: 30, gap: 6 },
  recapTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginTop: 8 },
  recapBody: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 12 },
  xpPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 12 },
  xpPillText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  recapFootnote: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 16, textAlign: 'center' },
});
