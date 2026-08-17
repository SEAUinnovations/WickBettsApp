import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card, PrimaryButton, Screen } from '@/components/WickUI';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { buildOptionsRounds, type Moneyness, type OptionsRound } from '@/lib/learningData';
import { loadLearningProgress, saveLearningProgress, type LearningProgress } from '@/lib/learningStorage';

const ROUNDS = 8;

export default function OptionsStrikeLabScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  const userId = user?.id;

  const [prevProgress, setPrevProgress] = useState<LearningProgress | null>(null);
  const [order, setOrder] = useState<OptionsRound[]>(() => buildOptionsRounds(ROUNDS));
  const [round, setRound] = useState(0);
  const [selected, setSelected] = useState<Moneyness | null>(null);
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
    setSelected(null);
  }, [round]);

  const pick = (moneyness: Moneyness) => {
    if (selected || !current) return;
    setSelected(moneyness);
    const correct = moneyness === current.correctMoneyness;
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
      completedModules: prev.completedModules.includes('options-strike-lab')
        ? prev.completedModules
        : [...prev.completedModules, 'options-strike-lab'],
      optionsGame: {
        bestScore: Math.max(prev.optionsGame.bestScore, finalScore),
        bestStreak: Math.max(prev.optionsGame.bestStreak, finalBestStreak),
        plays: prev.optionsGame.plays + 1,
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
    setOrder(buildOptionsRounds(ROUNDS));
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
      <Text style={[styles.backTitle, { color: colors.foreground }]}>Options Strike Lab</Text>
      <View style={{ width: 42 }} />
    </View>
  );

  if (finished) {
    return (
      <Screen contentStyle={styles.content}>
        {backRow}
        <Card style={styles.recapCard}>
          <Ionicons name="infinite" size={30} color={colors.accent} />
          <Text style={[styles.recapTitle, { color: colors.foreground }]}>Session complete.</Text>
          <Text style={[styles.recapBody, { color: colors.mutedForeground }]}>
            You matched <Text style={{ fontFamily: 'Inter_700Bold', color: colors.foreground }}>{score}/{order.length}</Text> strikes to the goal, with a best streak of{' '}
            <Text style={{ fontFamily: 'Inter_700Bold', color: colors.foreground }}>{bestStreakThisRun}</Text>.
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
              Personal best: {Math.max(prevProgress.optionsGame.bestScore, score)}/{order.length} · Best streak {Math.max(prevProgress.optionsGame.bestStreak, bestStreakThisRun)}
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
      <View style={[styles.simBadge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Ionicons name="flask-outline" size={12} color={colors.primary} />
        <Text style={[styles.simBadgeText, { color: colors.mutedForeground }]}>
          Simulated scenario — randomized ticker &amp; simplified Greeks, not a real options chain
        </Text>
      </View>
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

        <View style={styles.tickerRow}>
          <View style={[styles.tickerBadge, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.tickerSymbol, { color: colors.accent }]}>{current.ticker.symbol}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.tickerName, { color: colors.foreground }]}>{current.ticker.name}</Text>
            <Text style={[styles.tickerPrice, { color: colors.mutedForeground }]}>
              Trading near ${current.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · Shopping {current.callOrPut}s
            </Text>
          </View>
        </View>

        <View style={[styles.goalCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Text style={[styles.goalLabel, { color: colors.primary }]}>YOUR GOAL</Text>
          <Text style={[styles.goalTitle, { color: colors.foreground }]}>{current.goalLabel}</Text>
          <Text style={[styles.goalDetail, { color: colors.mutedForeground }]}>{current.goalDetail}</Text>
        </View>

        <Text style={[styles.prompt, { color: colors.mutedForeground }]}>Which strike fits the goal?</Text>

        <View style={styles.strikes}>
          {current.strikes.map((strike) => {
            const isCorrect = strike.moneyness === current.correctMoneyness;
            const isSelected = strike.moneyness === selected;
            const bg = selected
              ? isCorrect
                ? '#11271E'
                : isSelected
                  ? '#2B1418'
                  : colors.secondary
              : colors.secondary;
            const border = selected ? (isCorrect ? '#7AE2AA' : isSelected ? '#FB7185' : colors.border) : colors.border;
            const fg = selected ? (isCorrect ? '#7AE2AA' : isSelected ? '#FB7185' : colors.foreground) : colors.foreground;
            return (
              <Pressable
                key={strike.moneyness}
                onPress={() => pick(strike.moneyness)}
                disabled={!!selected}
                style={[styles.strikeOption, { backgroundColor: bg, borderColor: border }]}
                accessibilityRole="button"
                testID={`option-strike-${strike.moneyness.toLowerCase()}`}
              >
                <View style={styles.strikeHead}>
                  <Text style={[styles.strikeMoneyness, { color: fg }]}>{strike.moneyness}</Text>
                  <Text style={[styles.strikeLabel, { color: colors.mutedForeground }]}>{strike.label}</Text>
                </View>
                <View style={styles.strikeStats}>
                  <View style={styles.strikeStat}>
                    <Text style={[styles.strikeStatLabel, { color: colors.mutedForeground }]}>Delta</Text>
                    <Text style={[styles.strikeStatValue, { color: fg }]}>{strike.delta.toFixed(2)}</Text>
                  </View>
                  <View style={styles.strikeStat}>
                    <Text style={[styles.strikeStatLabel, { color: colors.mutedForeground }]}>Theta</Text>
                    <Text style={[styles.strikeStatValue, { color: fg }]}>-{Math.abs(strike.theta).toFixed(2)}/day</Text>
                  </View>
                  <View style={styles.strikeStat}>
                    <Text style={[styles.strikeStatLabel, { color: colors.mutedForeground }]}>Premium</Text>
                    <Text style={[styles.strikeStatValue, { color: fg }]}>${strike.premium.toFixed(2)}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        {selected ? (
          <View style={{ marginTop: 16 }}>
            <Text style={[styles.explainLabel, { color: colors.primary }]}>
              CORRECT STRIKE: {current.correctMoneyness}
            </Text>
            <Text style={[styles.explain, { color: colors.mutedForeground }]}>{current.explanation}</Text>
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
  simBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 16 },
  simBadgeText: { flex: 1, fontSize: 10, lineHeight: 14, fontFamily: 'Inter_500Medium' },
  gameCard: {},
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  topbarLabel: { flex: 1, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  topbarStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  topbarStatText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  tickerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  tickerBadge: { minWidth: 52, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  tickerSymbol: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  tickerName: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  tickerPrice: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  goalCard: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16 },
  goalLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 4 },
  goalTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  goalDetail: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  prompt: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', marginBottom: 12 },
  strikes: { gap: 10 },
  strikeOption: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12 },
  strikeHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 10 },
  strikeMoneyness: { fontSize: 14, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  strikeLabel: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  strikeStats: { flexDirection: 'row', gap: 18 },
  strikeStat: { gap: 2 },
  strikeStatLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  strikeStatValue: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  explainLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, marginBottom: 6 },
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
