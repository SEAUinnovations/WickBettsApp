/**
 * Live Trading Simulator engine — pure, framework-agnostic logic for a
 * fully client-side, always-simulated candlestick feed plus a paper-money
 * order book. No real market data, no real broker, and no real money ever
 * touches this: every price here is a random walk generated on-device —
 * the same "randomized outcomes, not a real quote or a real fill" spirit as
 * Funded Combine Prep (see FUNDED_PROFIT_TARGET etc. in learningData.ts),
 * just live-ticking instead of resolved day-by-day.
 *
 * Kept free of React/React Native imports so it can be unit-tested and
 * reused by both the chart component and the screen without either one
 * owning the simulation rules.
 */

import { MNQ_SPEC, NQ_SPEC, type FuturesContractSpec } from './contractSpecs';

export type SimTimeframe = '1m' | '5m' | '15m' | '30m' | '1h';
export const SIM_TIMEFRAMES: SimTimeframe[] = ['1m', '5m', '15m', '30m', '1h'];

export interface SimCandle {
  /** Simulated epoch ms — not wall-clock time, just a monotonically increasing axis label. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type SimSide = 'long' | 'short';

export interface SimPosition {
  side: SimSide;
  qty: number;
  avgPrice: number;
  /**
   * Optional bracket levels the member has set on this position. Checked
   * against every forming candle's high/low (not just the latest close) —
   * the first one crossed auto-closes the position at that trigger price,
   * the same way a resting broker order would fill. Cleared automatically
   * whenever the position is opened, added to, or flipped, since a bracket
   * set for one size/avgPrice doesn't necessarily still make sense for the
   * next one — the member re-sets it after any change, same as on a real
   * platform after a fill changes the position.
   */
  takeProfit?: number | null;
  stopLoss?: number | null;
}

export interface SimTradeLog {
  /** The action taken: 'long'/'short' for an opening or adding fill, 'flat' for a full close. */
  side: SimSide | 'flat';
  qty: number;
  price: number;
  /** Realized P&L booked by this specific fill — 0 for a fill that only opens or adds to a position. */
  pnl: number;
  time: number;
}

export interface SimAccountState {
  startingBalance: number;
  realizedPnl: number;
  position: SimPosition | null;
  trades: SimTradeLog[];
}

// ── Tunable constants ───────────────────────────────────────────────────────
// $50,000 simulated account, $2,000 max loss limit — the same figures the
// Funded Combine Prep game already teaches for its trailing-drawdown run
// (FUNDED_MAX_DRAWDOWN in learningData.ts), so the two modules stay
// consistent with each other. Unlike that game's trailing floor, this one
// is a fixed floor for the whole session — simpler to read live off a
// moving chart, and a deliberately different mechanic from its sibling
// module rather than a duplicate of it.
export const SIM_STARTING_BALANCE = 50_000;
export const SIM_MAX_LOSS = 2_000;
export const SIM_MLL_FLOOR = SIM_STARTING_BALANCE - SIM_MAX_LOSS;

// Abstracted dollars of P&L per 1.00 of price movement, per contract/unit —
// the default used when no real instrument is selected. Kept for backward
// compatibility with every P&L function below (all take an optional
// `pointValue` override now).
export const SIM_POINT_VALUE = 5;

export const SIM_QTY_PRESETS = [1, 3, 5, 10, 15] as const;

// Real, exchange-defined futures contracts the member can trade the sim
// against — same NQ vs MNQ specs taught in the "Contracts, Lot Sizes &
// Leverage" lesson (see lib/contractSpecs.ts), so picking one here uses the
// real $20/point vs $2/point multiplier instead of the abstracted
// SIM_POINT_VALUE, and the balance/P&L math on screen matches the lesson's
// worked examples exactly.
export type SimInstrumentId = 'NQ' | 'MNQ';
export const SIM_INSTRUMENTS: Record<SimInstrumentId, FuturesContractSpec> = { NQ: NQ_SPEC, MNQ: MNQ_SPEC };
export const SIM_INSTRUMENT_IDS: SimInstrumentId[] = ['NQ', 'MNQ'];

// How many candles stay in the visible rolling window.
export const SIM_VISIBLE_CANDLES = 44;

// Each timeframe has three independent notions of "time"/"scale" that must
// not be conflated:
//   - tickMs / ticksPerCandle: wall-clock pacing — how often a live tick
//     nudges the forming candle, and how many ticks make up one candle
//     before it closes and a new one opens. These now spread out a lot more
//     across timeframes than a single ~2-3s/candle band: 1m plays fast
//     (~1.3s/candle) and 1h plays noticeably slower (~6s/candle), so tapping
//     a different tab is immediately, visibly a different playback speed —
//     without actually making the member wait real minutes per candle.
//   - candleDurationMs: the simulated time-axis increment each candle
//     represents — i.e. what the '1m'/'5m'/'15m'/'30m'/'1h' label actually
//     means. This is what advances a candle's `time` field (via
//     seedSimCandles' stepMs and openSimCandle's time argument), completely
//     independent of how fast it's rendered ticking on screen.
//   - volatilityMultiplier: how much bigger a single candle's range is on
//     this timeframe, applied on top of the session's base per-tick
//     volatility (see tickSimCandle). A real 1h bar compresses an hour's
//     worth of movement into one candle, so it visibly dwarfs a 1m bar's
//     range — this multiplier is a dampened power-law scaling of
//     candleDurationMs (ratio^0.3, so 60x the duration is ~3.4x the range,
//     not a literal 60x) that reproduces that look without candles
//     occasionally rocketing off the visible chart.
export const SIM_TIMEFRAME_CONFIG: Record<
  SimTimeframe,
  { tickMs: number; ticksPerCandle: number; candleDurationMs: number; volatilityMultiplier: number }
> = {
  '1m': { tickMs: 220, ticksPerCandle: 6, candleDurationMs: 60_000, volatilityMultiplier: 1 },
  '5m': { tickMs: 260, ticksPerCandle: 7, candleDurationMs: 5 * 60_000, volatilityMultiplier: 1.62 },
  '15m': { tickMs: 320, ticksPerCandle: 8, candleDurationMs: 15 * 60_000, volatilityMultiplier: 2.25 },
  '30m': { tickMs: 420, ticksPerCandle: 9, candleDurationMs: 30 * 60_000, volatilityMultiplier: 2.77 },
  '1h': { tickMs: 600, ticksPerCandle: 10, candleDurationMs: 60 * 60_000, volatilityMultiplier: 3.41 },
};

/** Box-Muller transform — a plain uniform random walk makes candle bodies look spiky and unnatural; this gives a bell curve of step sizes like a real (simulated) price series. */
function gaussianNoise(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Keeps candle sizes visually sane across very different starting prices. */
export function volatilityForPrice(price: number): number {
  return Math.max(0.15, price * 0.0007);
}

/** A plausible-looking session starting price — not tied to any real quote. */
export function randomSimStartPrice(): number {
  return Math.round((80 + Math.random() * 4800) * 100) / 100;
}

/** Builds an initial rolling window of `count` candles ending near `startPrice`. */
export function seedSimCandles(count: number, startPrice: number, volatility: number, now: number, stepMs: number): SimCandle[] {
  const candles: SimCandle[] = [];
  // Walk backward a bit first so the seeded window isn't perfectly flat up
  // to the very last bar.
  let price = Math.max(0.5, startPrice - gaussianNoise() * volatility * 6);
  const startTime = now - stepMs * count;
  for (let i = 0; i < count; i++) {
    const open = price;
    const drift = gaussianNoise() * volatility;
    const close = Math.max(0.5, open + drift);
    const high = Math.max(open, close) + Math.abs(gaussianNoise()) * volatility * 0.6;
    const low = Math.max(0.25, Math.min(open, close) - Math.abs(gaussianNoise()) * volatility * 0.6);
    candles.push({ time: startTime + i * stepMs, open, high, low, close });
    price = close;
  }
  return candles;
}

/** Starts a brand-new forming candle off the previous close. */
export function openSimCandle(prevClose: number, time: number): SimCandle {
  return { time, open: prevClose, high: prevClose, low: prevClose, close: prevClose };
}

/** Applies one live tick to the currently-forming candle. Returns a new candle object. */
export function tickSimCandle(candle: SimCandle, volatility: number): SimCandle {
  const step = gaussianNoise() * volatility;
  const close = Math.max(0.5, candle.close + step);
  return {
    ...candle,
    close,
    high: Math.max(candle.high, close),
    low: Math.min(candle.low, close),
  };
}

// ── Account / order logic ───────────────────────────────────────────────────

export function blankSimAccount(startingBalance: number = SIM_STARTING_BALANCE): SimAccountState {
  return { startingBalance, realizedPnl: 0, position: null, trades: [] };
}

export function simBalance(account: SimAccountState): number {
  return account.startingBalance + account.realizedPnl;
}

export function simUnrealizedPnl(account: SimAccountState, price: number, pointValue: number = SIM_POINT_VALUE): number {
  if (!account.position) return 0;
  const diff = price - account.position.avgPrice;
  const signed = account.position.side === 'long' ? diff : -diff;
  return signed * account.position.qty * pointValue;
}

export function simEquity(account: SimAccountState, price: number, pointValue: number = SIM_POINT_VALUE): number {
  return simBalance(account) + simUnrealizedPnl(account, price, pointValue);
}

export function isSimBreached(account: SimAccountState, price: number, pointValue: number = SIM_POINT_VALUE): boolean {
  return simEquity(account, price, pointValue) <= SIM_MLL_FLOOR;
}

/**
 * Executes a market order against the current position.
 *   - Flat -> opens a new position in that direction.
 *   - Same side as the open position -> adds to it, blending the average price.
 *   - Opposite side, qty <= open position -> reduces (or exactly closes) the
 *     position and realizes P&L on the closed portion only.
 *   - Opposite side, qty > open position -> closes the whole position
 *     (realizing its P&L) and flips into a fresh position with the leftover
 *     qty in the new direction, so one order can act like close-and-reverse.
 */
export function placeSimMarketOrder(
  account: SimAccountState,
  side: SimSide,
  qty: number,
  price: number,
  time: number,
  pointValue: number = SIM_POINT_VALUE,
): SimAccountState {
  if (qty <= 0) return account;
  const pos = account.position;

  if (!pos) {
    return {
      ...account,
      position: { side, qty, avgPrice: price },
      trades: [...account.trades, { side, qty, price, pnl: 0, time }],
    };
  }

  if (pos.side === side) {
    const newQty = pos.qty + qty;
    const avgPrice = (pos.avgPrice * pos.qty + price * qty) / newQty;
    return {
      ...account,
      position: { side, qty: newQty, avgPrice },
      trades: [...account.trades, { side, qty, price, pnl: 0, time }],
    };
  }

  // Opposite side: closes into (and possibly through) the existing position.
  const closingQty = Math.min(qty, pos.qty);
  const diff = price - pos.avgPrice;
  const signed = pos.side === 'long' ? diff : -diff;
  const realized = signed * closingQty * pointValue;
  const remainderQty = qty - closingQty;
  const leftoverPosQty = pos.qty - closingQty;

  const nextPosition: SimPosition | null =
    remainderQty > 0
      ? { side, qty: remainderQty, avgPrice: price }
      : leftoverPosQty > 0
        ? { side: pos.side, qty: leftoverPosQty, avgPrice: pos.avgPrice }
        : null;

  return {
    ...account,
    realizedPnl: account.realizedPnl + realized,
    position: nextPosition,
    trades: [...account.trades, { side: nextPosition ? side : 'flat', qty, price, pnl: realized, time }],
  };
}

/** Flattens the current position entirely at the given price — the "Close Position" button, distinct from a market order that might only partially close or flip. */
export function closeSimPosition(account: SimAccountState, price: number, time: number, pointValue: number = SIM_POINT_VALUE): SimAccountState {
  const pos = account.position;
  if (!pos) return account;
  const diff = price - pos.avgPrice;
  const signed = pos.side === 'long' ? diff : -diff;
  const realized = signed * pos.qty * pointValue;
  return {
    ...account,
    realizedPnl: account.realizedPnl + realized,
    position: null,
    trades: [...account.trades, { side: 'flat', qty: pos.qty, price, pnl: realized, time }],
  };
}

/** Sets or clears the take-profit / stop-loss trigger prices on the currently open position. Pass null for either to clear just that one. No-op if flat. */
export function setSimBracket(account: SimAccountState, takeProfit: number | null, stopLoss: number | null): SimAccountState {
  if (!account.position) return account;
  return { ...account, position: { ...account.position, takeProfit, stopLoss } };
}

/**
 * Checks whether a candle's high/low range crossed either of the position's
 * bracket levels — using the full range rather than just the latest close,
 * so a brief intra-candle spike through the level still triggers it, the
 * way a real resting order would fill. Stop-loss is checked first on the
 * rare candle that could plausibly touch both.
 */
export function checkSimBracketHit(position: SimPosition, candle: SimCandle): { kind: 'takeProfit' | 'stopLoss'; price: number } | null {
  const { side, takeProfit, stopLoss } = position;
  if (side === 'long') {
    if (stopLoss != null && candle.low <= stopLoss) return { kind: 'stopLoss', price: stopLoss };
    if (takeProfit != null && candle.high >= takeProfit) return { kind: 'takeProfit', price: takeProfit };
  } else {
    if (stopLoss != null && candle.high >= stopLoss) return { kind: 'stopLoss', price: stopLoss };
    if (takeProfit != null && candle.low <= takeProfit) return { kind: 'takeProfit', price: takeProfit };
  }
  return null;
}

// ── Indicators ───────────────────────────────────────────────────────────
// Pure functions over a candle array, each returning one value per candle
// (null where there isn't enough history yet) so the chart can zip the
// result directly against `candles` for an overlay — no React, same as
// everything else in this file.

/** Simple moving average of closes over `period` candles. */
export function computeSMA(candles: SimCandle[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

/** Exponential moving average of closes, seeded with a simple average of the first `period` closes. */
export function computeEMA(candles: SimCandle[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (period + 1);
  let prevEma: number | null = null;
  for (let i = 0; i < candles.length; i++) {
    if (prevEma == null) {
      if (i >= period - 1) {
        const seedSlice = candles.slice(i - period + 1, i + 1);
        prevEma = seedSlice.reduce((s, c) => s + c.close, 0) / period;
        out.push(prevEma);
      } else {
        out.push(null);
      }
      continue;
    }
    prevEma = candles[i].close * k + prevEma * (1 - k);
    out.push(prevEma);
  }
  return out;
}

/** Wilder's RSI — a 0-100 momentum oscillator over candle-to-candle changes. */
export function computeRSI(candles: SimCandle[], period: number = 14): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < period + 1) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change >= 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/**
 * A simplified session VWAP: a running, equally-weighted average of each
 * candle's typical price ((high + low + close) / 3). The simulator has no
 * real volume series to weight by, so this is an approximation, not a
 * genuine volume-weighted price — it still teaches the shape VWAP is known
 * for: a steady line price stretches away from and tends to revert back to.
 */
export function computeSessionVwap(candles: SimCandle[]): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    const typical = (candles[i].high + candles[i].low + candles[i].close) / 3;
    sum += typical;
    out.push(sum / (i + 1));
  }
  return out;
}
