/**
 * Pure technical-indicator math used by the automated signal scanner.
 * No network calls here — everything operates on daily bars already fetched
 * by the caller, so this module is trivially unit-testable and never fails
 * on I/O.
 */

export interface DailyBar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Wilder's RSI (the standard, original formulation — the same one used by
 * virtually every charting platform and screener, including Finviz).
 * Returns null if there isn't enough history to compute a stable value.
 */
export function computeRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gainSum += change;
    else lossSum += -change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  // Wilder smoothing for the remainder of the series
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Daily-timeframe support/resistance via rolling swing low/high. Simple and
 * transparent on purpose: a 20-session lookback low/high is what most
 * discretionary daily-chart traders would circle by eye, and it doesn't
 * require guessing at pivot-detection parameters we can't backtest here.
 */
export function computeSupportResistance(
  bars: DailyBar[],
  lookback = 20,
): { support: number; resistance: number } | null {
  if (bars.length < lookback) return null;
  const window = bars.slice(-lookback);
  const support = Math.min(...window.map((b) => b.low));
  const resistance = Math.max(...window.map((b) => b.high));
  return { support, resistance };
}

/** Simple moving average of the last `period` volumes. */
export function computeAvgVolume(volumes: number[], period = 20): number | null {
  if (volumes.length < period) return null;
  const window = volumes.slice(-period);
  return window.reduce((sum, v) => sum + v, 0) / window.length;
}

/**
 * Annualized realized volatility from daily log returns. Used as an implied
 * volatility proxy for the options pricing model — see optionsModel.ts for
 * why we don't have real IV data.
 */
export function computeRealizedVolatility(closes: number[], period = 20): number | null {
  if (closes.length < period + 1) return null;
  const window = closes.slice(-(period + 1));
  const logReturns: number[] = [];
  for (let i = 1; i < window.length; i++) {
    logReturns.push(Math.log(window[i] / window[i - 1]));
  }
  const mean = logReturns.reduce((s, r) => s + r, 0) / logReturns.length;
  const variance = logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (logReturns.length - 1);
  const dailyStdev = Math.sqrt(variance);
  return dailyStdev * Math.sqrt(252); // trading days/year
}

/** Simple moving average of the last `period` closes. */
export function computeSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const window = closes.slice(-period);
  return window.reduce((s, v) => s + v, 0) / window.length;
}

/**
 * Bullish engulfing: the prior candle closed red, the current candle closed
 * green, and the current candle's real body (open-to-close) fully engulfs
 * the prior candle's real body. Bearish engulfing is the mirror image.
 * Standard candlestick-pattern definitions — no proprietary tuning here.
 */
function isBullishEngulfing(prev: DailyBar, curr: DailyBar): boolean {
  const prevBearish = prev.close < prev.open;
  const currBullish = curr.close > curr.open;
  return prevBearish && currBullish && curr.open <= prev.close && curr.close >= prev.open;
}
function isBearishEngulfing(prev: DailyBar, curr: DailyBar): boolean {
  const prevBullish = prev.close > prev.open;
  const currBearish = curr.close < curr.open;
  return prevBullish && currBearish && curr.open >= prev.close && curr.close <= prev.open;
}

export interface BreakoutRetestResult {
  direction: "Long" | "Short";
  /**
   * The structure level that was broken, then retested — this is the
   * "break of structure" reference: a Long thesis here is invalidated if
   * price closes back below this level (a Short thesis, back above it).
   * Meant to be used directly as (or to derive) the trade's stop.
   */
  brokenLevel: number;
  /** The retest bar's price extreme at the moment the engulfing candle confirmed. */
  retestPrice: number;
  /** How many bars ago the confirming engulfing candle closed (0 = the most recent bar). */
  barsAgo: number;
}

const STRUCTURE_LOOKBACK = 20; // same window as computeSupportResistance's rolling S/R
const RETEST_SEARCH_BARS = 12; // how far back to look for a break-then-retest sequence at all
const RETEST_CONFIRMATION_WINDOW = 3; // the engulfing candle itself must be one of the last N bars to count as a *live* signal, not a stale one
const RETEST_TOLERANCE = 0.015; // within 1.5% of the broken level counts as "retesting" it

/**
 * Detects a "break of structure, then retest, confirmed by an engulfing
 * candle" setup:
 *   1. Price closes beyond a prior rolling resistance/support level (the
 *      structure break) — computed from a window BEFORE the search window,
 *      so the level being broken isn't itself contaminated by the breakout.
 *   2. Price later pulls back to retest that same level (now acting as
 *      support after a bullish break, or resistance after a bearish one).
 *   3. Right at that retest, a bullish (or bearish) engulfing candle forms
 *      — the confirmation that the level is holding, not just being
 *      grazed on the way through.
 *
 * This is an additional, independent confluence signal layered on top of
 * the RSI/support-resistance/volume screen above — see signalScanner.ts's
 * rankScore for how it nudges candidate ranking, and buildAnalysisText for
 * how it's narrated. `brokenLevel` is meant to be used as the trade's stop:
 * the whole thesis is "risk the break of structure" — if price closes back
 * through that level, the retest failed and the setup is invalidated.
 */
export function detectBreakoutRetestEngulfing(bars: DailyBar[]): BreakoutRetestResult | null {
  if (bars.length < STRUCTURE_LOOKBACK + RETEST_SEARCH_BARS + 1) return null;
  const searchStart = bars.length - RETEST_SEARCH_BARS;
  const structureWindow = bars.slice(searchStart - STRUCTURE_LOOKBACK, searchStart);
  if (structureWindow.length < STRUCTURE_LOOKBACK) return null;
  const priorResistance = Math.max(...structureWindow.map((b) => b.high));
  const priorSupport = Math.min(...structureWindow.map((b) => b.low));
  const recent = bars.slice(searchStart);

  // Bullish: a break above priorResistance, later retested from above with
  // a bullish engulfing candle confirming the level held as new support.
  const breakUpIdx = recent.findIndex((b) => b.close > priorResistance);
  if (breakUpIdx !== -1) {
    const confirmFrom = Math.max(breakUpIdx + 1, recent.length - RETEST_CONFIRMATION_WINDOW);
    for (let i = confirmFrom; i < recent.length; i++) {
      const bar = recent[i];
      const prev = recent[i - 1];
      if (!prev) continue;
      const retested = bar.low <= priorResistance * (1 + RETEST_TOLERANCE) && bar.high >= priorResistance * (1 - RETEST_TOLERANCE);
      if (retested && isBullishEngulfing(prev, bar)) {
        return { direction: "Long", brokenLevel: priorResistance, retestPrice: bar.low, barsAgo: recent.length - 1 - i };
      }
    }
  }

  // Bearish: mirror image — break below priorSupport, retested from below
  // with a bearish engulfing candle confirming the level held as new resistance.
  const breakDownIdx = recent.findIndex((b) => b.close < priorSupport);
  if (breakDownIdx !== -1) {
    const confirmFrom = Math.max(breakDownIdx + 1, recent.length - RETEST_CONFIRMATION_WINDOW);
    for (let i = confirmFrom; i < recent.length; i++) {
      const bar = recent[i];
      const prev = recent[i - 1];
      if (!prev) continue;
      const retested = bar.high >= priorSupport * (1 - RETEST_TOLERANCE) && bar.low <= priorSupport * (1 + RETEST_TOLERANCE);
      if (retested && isBearishEngulfing(prev, bar)) {
        return { direction: "Short", brokenLevel: priorSupport, retestPrice: bar.high, barsAgo: recent.length - 1 - i };
      }
    }
  }

  return null;
}

export interface VolumeProfileBin {
  priceLow: number;
  priceHigh: number;
  volume: number;
}

export interface VolumeProfileResult {
  /** Point of control — the price at the center of the highest-volume bin across the anchored range. */
  poc: number;
  rangeLow: number;
  rangeHigh: number;
  bins: VolumeProfileBin[];
}

const VOLUME_PROFILE_BINS = 20;

/**
 * Fixed Range Volume Profile, anchored from the previous session's swing
 * high (the prior bar's high) down/up to the current price — a "where has
 * the volume actually traded between here and there" read, used as a
 * secondary entry-zone reference alongside the raw current price.
 *
 * There's no tick-level print data available (see the module doc comment —
 * every price source here is OHLCV bars), so each bar's volume is
 * distributed proportionally across every price bin its high-low range
 * overlaps, rather than assigned to a single price. This is the standard
 * approximation charting platforms fall back to when computing a volume
 * profile from bars instead of raw prints, and it degrades gracefully for
 * this app's flatter bars too (CoinGecko's daily crypto bars set
 * open=high=low=close — see marketHistory.ts — which just collapses every
 * bar's volume into a single bin, still directionally useful).
 */
export function computeFixedRangeVolumeProfile(bars: DailyBar[], bins = VOLUME_PROFILE_BINS): VolumeProfileResult | null {
  if (bars.length < 2) return null;
  const previousSessionHigh = bars[bars.length - 2].high;
  const currentPrice = bars[bars.length - 1].close;
  const rangeLow = Math.min(previousSessionHigh, currentPrice);
  const rangeHigh = Math.max(previousSessionHigh, currentPrice);
  if (rangeHigh <= rangeLow) return null;

  const binSize = (rangeHigh - rangeLow) / bins;
  const volumes = new Array(bins).fill(0) as number[];

  // Fixed-range profile: only bars whose own high-low range overlaps the
  // anchored [rangeLow, rangeHigh] band contribute, unlike a whole-chart
  // volume profile.
  for (const bar of bars) {
    const barLow = Math.min(bar.low, bar.high);
    const barHigh = Math.max(bar.low, bar.high);
    const overlapLow = Math.max(barLow, rangeLow);
    const overlapHigh = Math.min(barHigh, rangeHigh);
    if (overlapHigh <= overlapLow) continue;
    const barSpan = barHigh - barLow || binSize; // guard zero-range bars
    const startBin = Math.max(0, Math.floor((overlapLow - rangeLow) / binSize));
    const endBin = Math.min(bins - 1, Math.floor((overlapHigh - rangeLow) / binSize));
    for (let b = startBin; b <= endBin; b++) {
      const binLow = rangeLow + b * binSize;
      const binHigh = binLow + binSize;
      const overlap = Math.min(binHigh, overlapHigh) - Math.max(binLow, overlapLow);
      volumes[b] += (bar.volume * Math.max(overlap, 0)) / barSpan;
    }
  }

  let pocBin = 0;
  for (let b = 1; b < bins; b++) if (volumes[b] > volumes[pocBin]) pocBin = b;
  const poc = rangeLow + (pocBin + 0.5) * binSize;
  const outBins: VolumeProfileBin[] = volumes.map((volume, i) => ({
    priceLow: rangeLow + i * binSize,
    priceHigh: rangeLow + (i + 1) * binSize,
    volume,
  }));

  return { poc, rangeLow, rangeHigh, bins: outBins };
}

export interface ScreenResult {
  rsi: number;
  price: number;
  support: number;
  resistance: number;
  avgVolume: number;
  currentVolume: number;
  volumeRatio: number;
  realizedVol: number | null;
  sma20: number | null;
  sma50: number | null;
  /** Does the trade direction agree with the longer-term (50-day) trend? Extra conviction context for the thesis. */
  trendAligned: boolean | null;
  /** How far price sits above support (for bullish) or below resistance (for bearish), as a fraction. */
  proximityPct: number;
  direction: "Long" | "Short";
  /** True only when RSI + proximity + volume all clear the strict thresholds. */
  strictMatch: boolean;
  /** Composite score for ranking candidates when multiple qualify (higher = more extreme/interesting). */
  score: number;
  /**
   * Break-of-structure retest + engulfing confluence (see
   * detectBreakoutRetestEngulfing) — null when no such setup is currently
   * live. Only ever populated in this field when it AGREES with `direction`
   * above (a bearish retest signal on an RSI-oversold/bullish candidate is
   * simply not attached, rather than surfaced as a contradiction).
   */
  breakoutRetest: BreakoutRetestResult | null;
  /**
   * Fixed Range Volume Profile from the previous session's high to the
   * current price (see computeFixedRangeVolumeProfile) — an entry-zone
   * reference, not a requirement; null only when there isn't enough bar
   * history to compute it.
   */
  volumeProfile: VolumeProfileResult | null;
}

const RSI_OVERSOLD = 35;
const RSI_OVERBOUGHT = 70;
const PROXIMITY_TOLERANCE = 0.02; // within 2% of the level
const VOLUME_RATIO_MIN = 1.3; // at least 30% above the 20-day average

/**
 * Screens a single symbol's daily bars for the "oversold at support" (bullish)
 * or "overbought at resistance" (bearish) setup described by the trading
 * criteria: RSI extreme + price near a daily support/resistance level +
 * above-average volume.
 *
 * Hard RSI gate: a symbol only becomes a candidate at all when RSI(14) is at
 * or below 35 (oversold — bullish direction) or above 70 (overbought —
 * bearish direction). Anything in between (35 < RSI <= 70) is skipped
 * entirely, regardless of how well it scores on proximity/volume — RSI is a
 * required filter here, not just a scoring input. Since the two bands don't
 * overlap, whichever one the reading falls into determines the direction;
 * there is no more "pick whichever side scores better" fallback.
 */
export function screenSymbol(bars: DailyBar[]): ScreenResult | null {
  if (bars.length < 25) return null;
  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);

  const rsi = computeRSI(closes, 14);
  const sr = computeSupportResistance(bars, 20);
  const avgVolume = computeAvgVolume(volumes, 20);
  const realizedVol = computeRealizedVolatility(closes, 20);
  const sma20 = computeSMA(closes, 20);
  const sma50 = computeSMA(closes, 50);
  const price = closes[closes.length - 1];
  const currentVolume = volumes[volumes.length - 1];

  if (rsi === null || !sr || avgVolume === null || !avgVolume) return null;

  const isOversold = rsi <= RSI_OVERSOLD;
  const isOverbought = rsi > RSI_OVERBOUGHT;
  if (!isOversold && !isOverbought) return null;

  const volumeRatio = currentVolume / avgVolume;
  const direction: "Long" | "Short" = isOversold ? "Long" : "Short";
  const rsiGap = isOversold ? RSI_OVERSOLD - rsi : rsi - RSI_OVERBOUGHT; // always >= 0 given the gate above
  const proximityPct =
    direction === "Long"
      ? Math.abs(price - sr.support) / sr.support
      : Math.abs(price - sr.resistance) / sr.resistance;

  // Score is now purely a ranking signal among already-qualifying candidates
  // (RSI gap dominates, proximity/volume are secondary confirmations) — the
  // RSI requirement itself is enforced by the gate above, not by this score.
  // Break-of-structure retest + engulfing is an independent confluence on
  // top of the RSI/S-R/volume screen — only attached when it agrees with
  // the direction the RSI gate already settled on; a contradicting signal
  // (e.g. a bearish retest on an RSI-oversold/Long candidate) is discarded
  // rather than surfaced, since this app never trades two directions on the
  // same candidate at once.
  const rawBreakoutRetest = detectBreakoutRetestEngulfing(bars);
  const breakoutRetest = rawBreakoutRetest && rawBreakoutRetest.direction === direction ? rawBreakoutRetest : null;
  const volumeProfile = computeFixedRangeVolumeProfile(bars);

  // A confirmed break-of-structure retest is a materially stronger, more
  // specific thesis than the base RSI/S-R screen alone (it's a named,
  // three-part pattern rather than a single indicator reading), so it earns
  // a meaningful rank bump — bigger than the macro-confluence nudge in
  // signalScanner.ts's rankScore, since this is a primary technical signal
  // rather than a secondary cross-asset one.
  const BREAKOUT_RETEST_SCORE_BONUS = 4;
  const proximityScore = Math.max(0, 1 - proximityPct / PROXIMITY_TOLERANCE) * 5;
  const volumeScore = Math.max(0, volumeRatio - 1) * 5;
  const score = rsiGap + proximityScore + volumeScore + (breakoutRetest ? BREAKOUT_RETEST_SCORE_BONUS : 0);

  const strictMatch =
    proximityPct <= PROXIMITY_TOLERANCE && volumeRatio >= VOLUME_RATIO_MIN;

  // Trend alignment: a Long (bullish, oversold-bounce) setup carries more
  // conviction when the 50-day trend is still up (dip-buy) than when it's
  // down (falling knife) — surfaced in the thesis text either way.
  const trendAligned =
    sma50 === null ? null : direction === "Long" ? price >= sma50 : price <= sma50;

  return {
    rsi,
    price,
    support: sr.support,
    resistance: sr.resistance,
    avgVolume,
    currentVolume,
    volumeRatio,
    realizedVol,
    sma20,
    sma50,
    trendAligned,
    proximityPct,
    direction,
    strictMatch,
    score,
    breakoutRetest,
    volumeProfile,
  };
}
