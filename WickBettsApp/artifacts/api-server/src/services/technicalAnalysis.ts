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
}

const RSI_OVERSOLD = 30;
const RSI_OVERBOUGHT = 70;
const PROXIMITY_TOLERANCE = 0.02; // within 2% of the level
const VOLUME_RATIO_MIN = 1.3; // at least 30% above the 20-day average

/**
 * Screens a single symbol's daily bars for the "oversold at support" (bullish)
 * or "overbought at resistance" (bearish) setup described by the trading
 * criteria: RSI extreme + price near a daily support/resistance level +
 * above-average volume. Returns the best-fitting direction (whichever side
 * is closer to qualifying) so the caller can still rank near-misses when
 * nothing in the universe strictly qualifies on a given scan.
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

  const volumeRatio = currentVolume / avgVolume;

  // Distance from oversold/support (bullish case)
  const bullishRsiGap = RSI_OVERSOLD - rsi; // positive = actually oversold
  const bullishProximity = Math.abs(price - sr.support) / sr.support;

  // Distance from overbought/resistance (bearish case)
  const bearishRsiGap = rsi - RSI_OVERBOUGHT; // positive = actually overbought
  const bearishProximity = Math.abs(price - sr.resistance) / sr.resistance;

  // Score each side; higher is a "more extreme" / more interesting setup.
  // RSI gap dominates (it's the primary oversold/overbought signal), proximity
  // and volume are secondary confirmations baked into the same score so a
  // deeply oversold stock miles from support still ranks below one that's
  // oversold AND sitting right on the level with volume behind it.
  const scoreFor = (rsiGap: number, proximity: number) => {
    const proximityScore = Math.max(0, 1 - proximity / PROXIMITY_TOLERANCE) * 5;
    const volumeScore = Math.max(0, volumeRatio - 1) * 5;
    return rsiGap + proximityScore + volumeScore;
  };

  const bullishScore = scoreFor(bullishRsiGap, bullishProximity);
  const bearishScore = scoreFor(bearishRsiGap, bearishProximity);

  const isBullishBetter = bullishScore >= bearishScore;
  const direction: "Long" | "Short" = isBullishBetter ? "Long" : "Short";
  const rsiGap = isBullishBetter ? bullishRsiGap : bearishRsiGap;
  const proximityPct = isBullishBetter ? bullishProximity : bearishProximity;
  const score = isBullishBetter ? bullishScore : bearishScore;

  const strictMatch =
    rsiGap >= 0 && proximityPct <= PROXIMITY_TOLERANCE && volumeRatio >= VOLUME_RATIO_MIN;

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
  };
}
