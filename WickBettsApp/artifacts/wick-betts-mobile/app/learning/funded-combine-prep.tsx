import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card, PrimaryButton, Screen } from '@/components/WickUI';
import { CandleGlyph } from '@/components/CandleGlyph';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import {
  FUNDED_MAX_DAYS,
  FUNDED_MAX_DRAWDOWN,
  FUNDED_PROFIT_TARGET,
  RISK_TIERS,
  buildFundedDays,
  resolveFundedDay,
  riskAmountForTier,
  type FundedDaySetup,
  type RiskTierSpec,
} from '@/lib/learningData';
import { loadLearningProgress, saveLearningProgress, type LearningProgress } from '@/lib/learningStorage';

type Status = 'playing' | 'ready' | 'blown' | 'out-of-days';
interface DayLog { day: number; pnl: number; won: boolean }

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;

export default function FundedCombinePrepScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  const userId = user?.id;

  const [prevProgress, setPrevProgress] = useState<LearningProgress | null>(null);
  const [days, setDays] = useState<FundedDaySetup[]>(() => buildFundedDays(FUNDED_MAX_DAYS));
  const [dayIndex, setDayIndex] = useState(0);
  const [equity, setEquity] = useState(0);
  const [peakEquity, setPeakEquity] = useState(0);
  const [log, setLog] = useState<DayLog[]>([]);
  const [winStreak, setWinStreak] = useState(0);
  const [bestStreakThisRun, setBestStreakThisRun] = useState(0);
  const [result, setResult] = useState<{ tier: RiskTierSpec; riskAmount: number; won: boolean; pnl: number } | null>(null);
  const [status, setStatus] = useState<Status>('playing');
  const [savedXp, setSavedXp] = useState(0);
  const [saved, setSaved] = useState(false);

  const current = days[dayIndex];
  const floor = peakEquity - FUNDED_MAX_DRAWDOWN;
  const cushion = Math.max(0, equity - floor);

  useEffect(() => {
    void loadLearningProgress(userId).then(setPrevProgress);
  }, [userId]);

  const pickTier = (tier: RiskTierSpec) => {
    if (result || status !== 'playing') return;
    const riskAmount = riskAmountForTier(tier, cushion);
    const { won, pnl } = resolveFundedDay(riskAmount);
    setResult({ tier, riskAmount, won, pnl });
    void Haptics.notificationAsync(won ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);

    const nextEquity = equity + pnl;
    const nextPeak = Math.max(peakEquity, nextEquity);
    const nextFloor = nextPeak - FUNDED_MAX_DRAWDOWN;
    setEquity(nextEquity);
    setPeakEquity(nextPeak);
    setLog((l) => [...l, { day: current.day, pnl, won }]);
    setWinStreak((s) => {
      const next = won ? s + 1 : 0;
      setBestStreakThisRun((b) => Math.max(b, next));
      return next;
    });

    if (nextEquity <= nextFloor) {
      setStatus('blown');
    } else if (nextEquity >= FUNDED_PROFIT_TARGET) {
      setStatus('ready');
    } else if (dayIndex + 1 >= days.length) {
      setStatus('out-of-days');
    }
  };

  useEffect(() => {
    if (status === 'playing' || saved) return;
    const finalEquity = equity;
    const xpEarned = Math.max(0, 40 + Math.round(Math.max(0, finalEquity) / 15) + bestStreakThisRun * 5 + (status === 'ready' ? 150 : 0));
    setSavedXp(xpEarned);
    setSaved(true);
    void (async () => {
      const prev = await loadLearningProgress(userId);
      const next: LearningProgress = {
        ...prev,
        xp: prev.xp + xpEarned,
        completedModules: prev.completedModules.includes('funded-combine-prep')
          ? prev.completedModules
          : [...prev.completedModules, 'funded-combine-prep'],
        fundedGame: {
          bestEquity: Math.max(prev.fundedGame.bestEquity, peakEquity),
          bestStreak: Math.max(prev.fundedGame.bestStreak, bestStreakThisRun),
          timesReady: prev.fundedGame.timesReady + (status === 'ready' ? 1 : 0),
          plays: prev.fundedGame.plays + 1,
        },
      };
      await saveLearningProgress(userId, next);
      setPrevProgress(next);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const next = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setResult(null);
    setDayIndex((d) => d + 1);
  };

  const playAgain = () => {
    setDays(buildFundedDays(FUNDED_MAX_DAYS));
    setDayIndex(0);
    setEquity(0);
    setPeakEquity(0);
    setLog([]);
    setWinStreak(0);
    setBestStreakThisRun(0);
    setResult(null);
    setStatus('playing');
    setSaved(false);
  };

  const bestSingleDayPct = (() => {
    if (log.length === 0 || equity <= 0) return 0;
    const bestDay = Math.max(...log.map((l) => l.pnl));
    return Math.round((bestDay / equity) * 100);
  })();

  const backRow = (
    <View style={styles.backRow}>
      <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
        <Ionicons name="arrow-back" size={21} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.backTitle, { color: colors.foreground }]}>Funded Combine Prep</Text>
      <View style={{ width: 42 }} />
    </View>
  );

  if (status !== 'playing') {
    const outcome = status === 'ready'
      ? { icon: 'trophy' as const, color: '#7AE2AA', title: 'Combine-ready.', body: `You grew the paper account to ${money(equity)} — past the $${FUNDED_PROFIT_TARGET.toLocaleString()} target — without breaching the trailing drawdown.` }
      : status === 'blown'
        ? { icon: 'warning' as const, color: '#FB7185', title: 'Drawdown breached.', body: `Equity hit ${money(equity)}, at or below the trailing floor. On a real evaluation, this ends the account immediately — no recovery, no second chance.` }
        : { icon: 'hourglass' as const, color: '#FDBA74', title: 'Out of trading days.', body: `You finished at ${money(equity)} of the $${FUNDED_PROFIT_TARGET.toLocaleString()} target after ${FUNDED_MAX_DAYS} simulated days. Not a failure — just not there yet.` };

    return (
      <Screen contentStyle={styles.content}>
        {backRow}
        <Card style={styles.recapCard}>
          <Ionicons name={outcome.icon} size={30} color={outcome.color} />
          <Text style={[styles.recapTitle, { color: colors.foreground }]}>{outcome.title}</Text>
          <Text style={[styles.recapBody, { color: colors.mutedForeground }]}>{outcome.body}</Text>
          <View style={styles.recapStatsRow}>
            <View style={styles.recapStat}>
              <Text style={[styles.recapStatLabel, { color: colors.mutedForeground }]}>DAYS USED</Text>
              <Text style={[styles.recapStatValue, { color: colors.foreground }]}>{log.length}/{FUNDED_MAX_DAYS}</Text>
            </View>
            <View style={styles.recapStat}>
              <Text style={[styles.recapStatLabel, { color: colors.mutedForeground }]}>BEST WIN STREAK</Text>
              <Text style={[styles.recapStatValue, { color: colors.foreground }]}>{bestStreakThisRun}</Text>
            </View>
            <View style={styles.recapStat}>
              <Text style={[styles.recapStatLabel, { color: colors.mutedForeground }]}>PEAK EQUITY</Text>
              <Text style={[styles.recapStatValue, { color: colors.foreground }]}>{money(peakEquity)}</Text>
            </View>
          </View>
          {status === 'ready' && bestSingleDayPct > 50 ? (
            <View style={[styles.consistencyNote, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
              <Text style={[styles.consistencyNoteText, { color: colors.mutedForeground }]}>
                Worth noting: your single best day was {bestSingleDayPct}% of total profit. On a real evaluation with a 50% consistency rule, this run would have been flagged.
              </Text>
            </View>
          ) : null}
          <View style={[styles.xpPill, { backgroundColor: colors.secondary }]}>
            <Ionicons name="flash" size={12} color="#FDBA74" />
            <Text style={[styles.xpPillText, { color: '#FDBA74' }]}>+{savedXp} XP earned</Text>
          </View>
          <View style={{ marginTop: 20, alignSelf: 'stretch' }}>
            <PrimaryButton onPress={playAgain} icon="refresh-outline">Run it back</PrimaryButton>
          </View>
          {prevProgress ? (
            <Text style={[styles.recapFootnote, { color: colors.mutedForeground }]}>
              Best peak equity: {money(Math.max(prevProgress.fundedGame.bestEquity, peakEquity))} · Combine-ready {prevProgress.fundedGame.timesReady} time(s) total
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
          Optional paper-trading practice — randomized outcomes, not a real prop-firm account or real fills
        </Text>
      </View>

      <Card style={styles.progressCard}>
        <View style={styles.progressHead}>
          <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>DAY {current.day}/{FUNDED_MAX_DAYS}</Text>
          <Text style={[styles.progressEquity, { color: equity >= 0 ? colors.foreground : '#FB7185' }]}>{money(equity)} / ${FUNDED_PROFIT_TARGET.toLocaleString()}</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${Math.max(0, Math.min(100, Math.round((equity / FUNDED_PROFIT_TARGET) * 100)))}%` }]} />
        </View>
        <View style={styles.cushionRow}>
          <Ionicons name="shield-outline" size={12} color={colors.mutedForeground} />
          <Text style={[styles.cushionText, { color: colors.mutedForeground }]}>
            Drawdown cushion: {money(cushion)} (trailing floor at {money(floor)})
          </Text>
        </View>
      </Card>

      <Card style={styles.gameCard}>
        <View style={styles.tickerRow}>
          <View style={[styles.tickerBadge, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.tickerSymbol, { color: colors.accent }]}>{current.ticker.symbol}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.tickerName, { color: colors.foreground }]}>{current.ticker.name}</Text>
            <Text style={[styles.tickerPrice, { color: colors.mutedForeground }]}>
              Near ${current.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
        </View>

        <View style={styles.stage}>
          <CandleGlyph candles={current.pattern.candles} height={110} />
        </View>
        <Text style={[styles.prompt, { color: colors.mutedForeground }]}>
          Today's read: {current.pattern.name} — {current.pattern.role.toLowerCase()}. How much of your cushion do you risk?
        </Text>

        {!result ? (
          <View style={styles.tiers}>
            {RISK_TIERS.map((tier) => {
              const amount = riskAmountForTier(tier, cushion);
              return (
                <Pressable
                  key={tier.tier}
                  onPress={() => pickTier(tier)}
                  style={[styles.tierOption, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                  accessibilityRole="button"
                  testID={`option-tier-${tier.tier.toLowerCase()}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tierName, { color: colors.foreground }]}>{tier.tier}</Text>
                    <Text style={[styles.tierBlurb, { color: colors.mutedForeground }]}>{tier.blurb}</Text>
                  </View>
                  <Text style={[styles.tierAmount, { color: colors.primary }]}>{money(amount)}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={{ marginTop: 6 }}>
            <View style={[styles.resultBanner, { backgroundColor: result.won ? '#11271E' : '#2B1418', borderColor: result.won ? '#7AE2AA' : '#FB7185' }]}>
              <Ionicons name={result.won ? 'trending-up' : 'trending-down'} size={16} color={result.won ? '#7AE2AA' : '#FB7185'} />
              <Text style={[styles.resultText, { color: result.won ? '#7AE2AA' : '#FB7185' }]}>
                {result.tier.tier} risk of {money(result.riskAmount)} → {result.won ? 'Winner' : 'Loss'}: {result.pnl >= 0 ? '+' : ''}{money(result.pnl)}
              </Text>
            </View>
            <Pressable onPress={next} style={[styles.nextButton, { backgroundColor: colors.secondary }]} accessibilityRole="button">
              <Text style={[styles.nextButtonText, { color: colors.foreground }]}>Next trading day</Text>
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
  progressHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  progressLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  progressEquity: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  cushionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  cushionText: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  gameCard: {},
  tickerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  tickerBadge: { minWidth: 52, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  tickerSymbol: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  tickerName: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  tickerPrice: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  stage: { alignItems: 'center', paddingVertical: 14 },
  prompt: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular', textAlign: 'center', marginBottom: 16 },
  tiers: { gap: 10 },
  tierOption: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  tierName: { fontSize: 13, fontFamily: 'Inter_700Bold', marginBottom: 2 },
  tierBlurb: { fontSize: 10, lineHeight: 14, fontFamily: 'Inter_400Regular' },
  tierAmount: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  resultBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  resultText: { flex: 1, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  nextButton: { marginTop: 14, minHeight: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  nextButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  recapCard: { alignItems: 'center', paddingVertical: 30, gap: 6 },
  recapTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginTop: 8 },
  recapBody: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 12 },
  recapStatsRow: { flexDirection: 'row', gap: 22, marginTop: 16 },
  recapStat: { alignItems: 'center' },
  recapStatLabel: { fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 0.6, marginBottom: 4 },
  recapStatValue: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  consistencyNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 16 },
  consistencyNoteText: { flex: 1, fontSize: 10, lineHeight: 14, fontFamily: 'Inter_400Regular' },
  xpPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 12 },
  xpPillText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  recapFootnote: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 16, textAlign: 'center' },
});
