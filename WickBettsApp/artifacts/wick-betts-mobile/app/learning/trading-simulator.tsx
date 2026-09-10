import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Card, Metric, PrimaryButton, Screen } from '@/components/WickUI';
import { BrokerLinksCard } from '@/components/BrokerLinksCard';
import { LiveCandleChart } from '@/components/LiveCandleChart';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { LEARNING_MODULES, MOCK_FUTURES_TICKERS, type MockTicker } from '@/lib/learningData';
import { loadLearningProgress, saveLearningProgress, type LearningProgress } from '@/lib/learningStorage';
import {
  SIM_MLL_FLOOR,
  SIM_QTY_PRESETS,
  SIM_STARTING_BALANCE,
  SIM_TIMEFRAMES,
  SIM_TIMEFRAME_CONFIG,
  SIM_VISIBLE_CANDLES,
  blankSimAccount,
  closeSimPosition,
  isSimBreached,
  openSimCandle,
  placeSimMarketOrder,
  randomSimStartPrice,
  seedSimCandles,
  simBalance,
  simEquity,
  simUnrealizedPnl,
  tickSimCandle,
  volatilityForPrice,
  type SimAccountState,
  type SimCandle,
  type SimSide,
  type SimTimeframe,
} from '@/lib/liveSimEngine';

type Status = 'live' | 'ended';
type EndedReason = 'breach' | 'manual';

// The lesson this module pairs with — profit targets, drawdown mechanics,
// and consistency rules are exactly what a member is watching play out
// live on the chart above the order ticket.
const COMPANION_LESSON_ID = 'evaluation-anatomy';

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;

function pickTicker(): MockTicker {
  return MOCK_FUTURES_TICKERS[Math.floor(Math.random() * MOCK_FUTURES_TICKERS.length)];
}

interface SessionSeed {
  ticker: MockTicker;
  startPrice: number;
  volatility: number;
  candles: SimCandle[];
}

function createSession(timeframe: SimTimeframe): SessionSeed {
  const startPrice = randomSimStartPrice();
  const volatility = volatilityForPrice(startPrice);
  const config = SIM_TIMEFRAME_CONFIG[timeframe];
  // Seed the initial window at this timeframe's own candle "size" (see
  // volatilityMultiplier's doc comment in liveSimEngine.ts) so a session
  // that starts on, say, 1h doesn't open with 1m-sized candle bodies.
  const candles = seedSimCandles(SIM_VISIBLE_CANDLES, startPrice, volatility * config.volatilityMultiplier, Date.now(), config.candleDurationMs);
  return { ticker: pickTicker(), startPrice, volatility, candles };
}

export default function TradingSimulatorScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  const userId = user?.id;
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 860;

  const [timeframe, setTimeframe] = useState<SimTimeframe>('1m');
  const [session, setSession] = useState<SessionSeed>(() => createSession('1m'));
  const [candles, setCandles] = useState<SimCandle[]>(() => session.candles);
  const [account, setAccount] = useState<SimAccountState>(() => blankSimAccount());
  const [qty, setQty] = useState(1);
  const [paused, setPaused] = useState(false);
  const [focused, setFocused] = useState(true);
  const [status, setStatus] = useState<Status>('live');
  const [endedReason, setEndedReason] = useState<EndedReason>('manual');
  const [chartWidth, setChartWidth] = useState(0);
  // Maximizes the chart panel to the full row width and a much taller height
  // (TradingView's own "expand chart" behavior) — the order ticket drops
  // below instead of sitting beside it while this is on.
  const [expanded, setExpanded] = useState(false);

  const [prevProgress, setPrevProgress] = useState<LearningProgress | null>(null);
  const [savedXp, setSavedXp] = useState(0);
  const [saved, setSaved] = useState(false);

  const ticksRef = useRef(0);
  const peakEquityRef = useRef(SIM_STARTING_BALANCE);

  useEffect(() => {
    void loadLearningProgress(userId).then(setPrevProgress);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // Live ticking — pauses when the screen loses focus, the member hits
  // pause, or the session has ended. Re-paces itself when the timeframe tab
  // changes without resetting the account or the chart history.
  useEffect(() => {
    if (status !== 'live' || paused || !focused) return;
    const config = SIM_TIMEFRAME_CONFIG[timeframe];
    const interval = setInterval(() => {
      setCandles((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        ticksRef.current += 1;
        // Scaling by the timeframe's volatilityMultiplier is what makes a 1h
        // candle's range visibly dwarf a 1m candle's, same as a real chart —
        // without it, every timeframe tab just relabeled the same-sized
        // candles at a barely-different tick rate.
        const tickVolatility = session.volatility * config.volatilityMultiplier;
        if (ticksRef.current > config.ticksPerCandle) {
          ticksRef.current = 1;
          const opened = openSimCandle(last.close, last.time + config.candleDurationMs);
          const ticked = tickSimCandle(opened, tickVolatility);
          return [...prev.slice(1), ticked];
        }
        const ticked = tickSimCandle(last, tickVolatility);
        return [...prev.slice(0, -1), ticked];
      });
    }, config.tickMs);
    return () => clearInterval(interval);
  }, [status, paused, focused, timeframe, session.volatility]);

  const lastCandle = candles[candles.length - 1];
  const lastPrice = lastCandle ? lastCandle.close : session.startPrice;
  const balance = simBalance(account);
  const unrealized = simUnrealizedPnl(account, lastPrice);
  const equity = simEquity(account, lastPrice);

  // Track this run's peak equity for the recap, and flip to 'ended' the
  // instant simulated equity touches the max-loss floor.
  useEffect(() => {
    if (status !== 'live') return;
    peakEquityRef.current = Math.max(peakEquityRef.current, equity);
    if (isSimBreached(account, lastPrice)) {
      setStatus('ended');
      setEndedReason('breach');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equity, status]);

  useEffect(() => {
    if (status !== 'ended' || saved) return;
    const finalEquity = equity;
    const grewPast = Math.max(0, peakEquityRef.current - SIM_STARTING_BALANCE);
    const xpEarned = Math.max(20, 30 + Math.round(grewPast / 20) + (endedReason === 'manual' && finalEquity >= SIM_STARTING_BALANCE ? 40 : 0));
    setSavedXp(xpEarned);
    setSaved(true);
    void (async () => {
      const prev = await loadLearningProgress(userId);
      const next: LearningProgress = {
        ...prev,
        xp: prev.xp + xpEarned,
        completedModules: prev.completedModules.includes('trading-simulator')
          ? prev.completedModules
          : [...prev.completedModules, 'trading-simulator'],
        liveSimGame: {
          bestEquity: Math.max(prev.liveSimGame.bestEquity, peakEquityRef.current),
          timesBreached: prev.liveSimGame.timesBreached + (endedReason === 'breach' ? 1 : 0),
          plays: prev.liveSimGame.plays + 1,
        },
      };
      await saveLearningProgress(userId, next);
      setPrevProgress(next);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const placeOrder = (side: SimSide) => {
    if (status !== 'live') return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAccount((prev) => placeSimMarketOrder(prev, side, qty, lastPrice, Date.now()));
  };

  const handleClosePosition = () => {
    if (status !== 'live' || !account.position) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAccount((prev) => closeSimPosition(prev, lastPrice, Date.now()));
  };

  const endSessionManually = () => {
    if (status !== 'live') return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStatus('ended');
    setEndedReason('manual');
  };

  const resetSession = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = createSession(timeframe);
    setSession(next);
    setCandles(next.candles);
    setAccount(blankSimAccount());
    setQty(1);
    setStatus('live');
    setEndedReason('manual');
    setSaved(false);
    ticksRef.current = 0;
    peakEquityRef.current = SIM_STARTING_BALANCE;
  };

  const adjustQty = (delta: number) => {
    void Haptics.selectionAsync();
    setQty((q) => Math.max(1, Math.min(50, q + delta)));
  };

  const companionLesson = LEARNING_MODULES.find((m) => m.id === COMPANION_LESSON_ID);

  const backRow = (
    <View style={styles.backRow}>
      <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
        <Ionicons name="arrow-back" size={21} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.backTitle, { color: colors.foreground }]}>Live Trading Simulator</Text>
      <View style={{ width: 42 }} />
    </View>
  );

  if (status === 'ended') {
    const profitable = equity >= SIM_STARTING_BALANCE;
    const manualBody = `You closed out at ${money(equity)} equity, starting from ${money(SIM_STARTING_BALANCE)}.`;
    const outcome = endedReason === 'breach'
      ? { icon: 'warning' as const, color: '#FB7185', title: 'Max loss limit hit.', body: `Simulated equity hit ${money(equity)}, at or below the $${SIM_MLL_FLOOR.toLocaleString()} floor. On a real evaluation, this ends the account immediately — no recovery, no second chance.` }
      : profitable
        ? { icon: 'trophy' as const, color: '#7AE2AA', title: 'Session ended.', body: manualBody }
        : { icon: 'flag' as const, color: '#FDBA74', title: 'Session ended.', body: manualBody };
    return (
      <Screen contentStyle={styles.content}>
        {backRow}
        <Card style={styles.recapCard}>
          <Ionicons name={outcome.icon} size={30} color={outcome.color} />
          <Text style={[styles.recapTitle, { color: colors.foreground }]}>{outcome.title}</Text>
          <Text style={[styles.recapBody, { color: colors.mutedForeground }]}>{outcome.body}</Text>
          <View style={styles.recapStatsRow}>
            <View style={styles.recapStat}>
              <Text style={[styles.recapStatLabel, { color: colors.mutedForeground }]}>FINAL EQUITY</Text>
              <Text style={[styles.recapStatValue, { color: colors.foreground }]}>{money(equity)}</Text>
            </View>
            <View style={styles.recapStat}>
              <Text style={[styles.recapStatLabel, { color: colors.mutedForeground }]}>PEAK EQUITY</Text>
              <Text style={[styles.recapStatValue, { color: colors.foreground }]}>{money(peakEquityRef.current)}</Text>
            </View>
            <View style={styles.recapStat}>
              <Text style={[styles.recapStatLabel, { color: colors.mutedForeground }]}>TRADES</Text>
              <Text style={[styles.recapStatValue, { color: colors.foreground }]}>{account.trades.length}</Text>
            </View>
          </View>
          <View style={[styles.xpPill, { backgroundColor: colors.secondary }]}>
            <Ionicons name="flash" size={12} color="#FDBA74" />
            <Text style={[styles.xpPillText, { color: '#FDBA74' }]}>+{savedXp} XP earned</Text>
          </View>
          <View style={{ marginTop: 20, alignSelf: 'stretch' }}>
            <PrimaryButton onPress={resetSession} icon="refresh-outline">Start new session</PrimaryButton>
          </View>
          {prevProgress ? (
            <Text style={[styles.recapFootnote, { color: colors.mutedForeground }]}>
              Best equity ever: {money(Math.max(prevProgress.liveSimGame.bestEquity, peakEquityRef.current))} · {prevProgress.liveSimGame.plays + 1} session(s) played
            </Text>
          ) : null}
        </Card>
        <BrokerLinksCard specialization="funded" />
      </Screen>
    );
  }

  const position = account.position;
  const posColor = position ? (position.side === 'long' ? '#7AE2AA' : '#FB7185') : colors.foreground;
  const posBg = position ? (position.side === 'long' ? '#11271E' : '#2B1418') : colors.secondary;

  // Expanded mode takes the full row width (on wide layouts) and a much
  // taller panel, mirroring TradingView's own "expand chart" control.
  const chartHeight = expanded ? (isWide ? 520 : 400) : 240;

  const chartColumn = (
    <View style={{ flex: isWide && !expanded ? 1.6 : undefined, gap: 14 }}>
      <View style={[styles.simBadge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Ionicons name="flask-outline" size={12} color={colors.primary} />
        <Text style={[styles.simBadgeText, { color: colors.mutedForeground }]}>
          Live practice sim — every price is randomly generated on-device. Not a real quote, a real fill, or a real funded account.
        </Text>
      </View>

      <Card style={styles.statsCard}>
        <View style={styles.statsRow}>
          <Metric label="BAL" value={money(balance)} />
          <Metric label="MLL" value={money(SIM_MLL_FLOOR)} />
          <Metric label="RP&L" value={money(account.realizedPnl)} color={account.realizedPnl > 0 ? '#7AE2AA' : account.realizedPnl < 0 ? '#FB7185' : undefined} />
          <Metric label="UP&L" value={money(unrealized)} color={unrealized > 0 ? '#7AE2AA' : unrealized < 0 ? '#FB7185' : undefined} />
        </View>
      </Card>

      <Card style={styles.chartCard}>
        <View style={styles.chartHead}>
          <View style={[styles.tickerBadge, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.tickerSymbol, { color: colors.accent }]}>{session.ticker.symbol}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.tickerName, { color: colors.foreground }]}>{session.ticker.name}</Text>
            <Text style={[styles.tickerPrice, { color: colors.mutedForeground }]}>
              ${lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
          <Pressable
            onPress={() => setPaused((p) => !p)}
            style={[styles.iconToggle, { backgroundColor: colors.secondary, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={paused ? 'Resume' : 'Pause'}
          >
            <Ionicons name={paused ? 'play-circle-outline' : 'pause-circle-outline'} size={18} color={colors.foreground} />
          </Pressable>
          <Pressable
            onPress={resetSession}
            style={[styles.iconToggle, { backgroundColor: colors.secondary, borderColor: colors.border, marginLeft: 8 }]}
            accessibilityRole="button"
            accessibilityLabel="Reset session"
          >
            <Ionicons name="refresh-outline" size={18} color={colors.foreground} />
          </Pressable>
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              setExpanded((e) => !e);
            }}
            style={[styles.iconToggle, { backgroundColor: colors.secondary, borderColor: colors.border, marginLeft: 8 }]}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Collapse chart' : 'Expand chart'}
          >
            <Ionicons name={expanded ? 'contract-outline' : 'expand-outline'} size={18} color={colors.foreground} />
          </Pressable>
        </View>

        <View style={styles.timeframeRow}>
          {SIM_TIMEFRAMES.map((tf) => {
            const active = tf === timeframe;
            return (
              <Pressable
                key={tf}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setTimeframe(tf);
                }}
                style={[
                  styles.timeframeTab,
                  { borderColor: active ? colors.primary : 'transparent' },
                  active && { backgroundColor: colors.secondary },
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.timeframeTabText, { color: active ? colors.primary : colors.mutedForeground }]}>{tf}</Text>
              </Pressable>
            );
          })}
        </View>

        <View onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)} style={{ marginTop: 6 }}>
          {chartWidth > 0 ? (
            <LiveCandleChart
              candles={candles}
              width={chartWidth}
              height={chartHeight}
              entryPrice={position ? position.avgPrice : null}
              entrySide={position ? position.side : null}
              symbol={session.ticker.symbol}
            />
          ) : null}
        </View>
      </Card>
    </View>
  );

  const orderColumn = (
    <View style={{ flex: isWide ? 1 : undefined, gap: 14 }}>
      {companionLesson ? (
        <Card>
          <View style={styles.lessonHead}>
            <View style={[styles.lessonIcon, { backgroundColor: colors.secondary }]}>
              <Ionicons name={companionLesson.icon} size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.lessonEyebrow, { color: colors.mutedForeground }]}>PAIRS WITH THIS MODULE</Text>
              <Text style={[styles.lessonTitle, { color: colors.foreground }]}>{companionLesson.title}</Text>
            </View>
          </View>
          <Text style={[styles.lessonTagline, { color: colors.mutedForeground }]}>{companionLesson.tagline}</Text>
          <Pressable
            onPress={() => router.push({ pathname: '/learning/lesson', params: { id: companionLesson.id } } as any)}
            style={[styles.lessonButton, { backgroundColor: colors.secondary }]}
            accessibilityRole="button"
          >
            <Text style={[styles.lessonButtonText, { color: colors.foreground }]}>Continue lesson</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.foreground} />
          </Pressable>
        </Card>
      ) : null}

      {position ? (
        <Card>
          <View style={styles.positionHead}>
            <View style={[styles.sideTag, { backgroundColor: posBg }]}>
              <Text style={[styles.sideTagText, { color: posColor }]}>{position.side === 'long' ? 'LONG' : 'SHORT'}</Text>
            </View>
            <Text style={[styles.positionQty, { color: colors.foreground }]}>{position.qty} @ {position.avgPrice.toFixed(2)}</Text>
          </View>
          <Text style={[styles.positionPnl, { color: unrealized > 0 ? '#7AE2AA' : unrealized < 0 ? '#FB7185' : colors.foreground }]}>
            {unrealized >= 0 ? '+' : ''}{money(unrealized)} unrealized
          </Text>
          <Pressable onPress={handleClosePosition} style={[styles.closeButton, { borderColor: colors.border }]} accessibilityRole="button">
            <Ionicons name="close-circle-outline" size={16} color={colors.foreground} />
            <Text style={[styles.closeButtonText, { color: colors.foreground }]}>Close position</Text>
          </Pressable>
        </Card>
      ) : null}

      <Card>
        <Text style={[styles.orderLabel, { color: colors.mutedForeground }]}>MARKET ORDER</Text>
        <View style={styles.qtyRow}>
          <Pressable onPress={() => adjustQty(-1)} style={[styles.qtyStepper, { borderColor: colors.border }]} accessibilityRole="button">
            <Ionicons name="remove" size={16} color={colors.foreground} />
          </Pressable>
          {SIM_QTY_PRESETS.map((preset) => {
            const active = preset === qty;
            return (
              <Pressable
                key={preset}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setQty(preset);
                }}
                style={[styles.qtyPreset, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : 'transparent' }]}
                accessibilityRole="button"
              >
                <Text style={[styles.qtyPresetText, { color: active ? colors.primaryForeground : colors.foreground }]}>{preset}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={() => adjustQty(1)} style={[styles.qtyStepper, { borderColor: colors.border }]} accessibilityRole="button">
            <Ionicons name="add" size={16} color={colors.foreground} />
          </Pressable>
        </View>

        <View style={styles.orderButtonsRow}>
          <Pressable onPress={() => placeOrder('long')} style={[styles.orderButton, { backgroundColor: '#1B8A5A' }]} accessibilityRole="button">
            <Text style={styles.orderButtonText}>Buy +{qty} Market</Text>
          </Pressable>
          <Pressable onPress={() => placeOrder('short')} style={[styles.orderButton, { backgroundColor: '#D64550' }]} accessibilityRole="button">
            <Text style={styles.orderButtonText}>Sell +{qty} Market</Text>
          </Pressable>
        </View>

        <Pressable onPress={endSessionManually} style={styles.endSessionRow} accessibilityRole="button">
          <Text style={[styles.endSessionText, { color: colors.mutedForeground }]}>End session</Text>
        </Pressable>
      </Card>
    </View>
  );

  return (
    <Screen contentStyle={styles.content}>
      {backRow}
      <View style={{ flexDirection: isWide && !expanded ? 'row' : 'column', gap: 14 }}>
        {chartColumn}
        {orderColumn}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 110 },
  backRow: { minHeight: 74, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  backTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  simBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  simBadgeText: { flex: 1, fontSize: 10, lineHeight: 14, fontFamily: 'Inter_500Medium' },
  statsCard: {},
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chartCard: {},
  chartHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  tickerBadge: { minWidth: 48, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  tickerSymbol: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  tickerName: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  tickerPrice: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  iconToggle: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  timeframeRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  timeframeTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  timeframeTabText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  lessonHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  lessonIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  lessonEyebrow: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 3 },
  lessonTitle: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  lessonTagline: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginBottom: 12 },
  lessonButton: { minHeight: 42, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  lessonButtonText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  positionHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  sideTag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  sideTagText: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.6 },
  positionQty: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  positionPnl: { fontSize: 13, fontFamily: 'Inter_700Bold', marginBottom: 12 },
  closeButton: { minHeight: 42, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  closeButtonText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  orderLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 12 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 16 },
  qtyStepper: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  qtyPreset: { minWidth: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  qtyPresetText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  orderButtonsRow: { flexDirection: 'row', gap: 10 },
  orderButton: { flex: 1, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  orderButtonText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  endSessionRow: { alignItems: 'center', paddingVertical: 12 },
  endSessionText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', textDecorationLine: 'underline' },
  recapCard: { alignItems: 'center', paddingVertical: 30, gap: 6 },
  recapTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', marginTop: 8 },
  recapBody: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 12 },
  recapStatsRow: { flexDirection: 'row', gap: 22, marginTop: 16 },
  recapStat: { alignItems: 'center' },
  recapStatLabel: { fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 0.6, marginBottom: 4 },
  recapStatValue: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  xpPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 12 },
  xpPillText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  recapFootnote: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 16, textAlign: 'center' },
});
