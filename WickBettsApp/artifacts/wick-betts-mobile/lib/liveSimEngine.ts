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
// not modeled on any single real instrument's actual multiplier, so the
// numbers stay legible without implying a specific product.
export const SIM_POINT_VALUE = 5;

export const SIM_QTY_PRESETS = [1, 3, 5, 10, 15] as const;

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

export function simUnrealizedPnl(account: SimAccountState, price: number): number {
  if (!account.position) return 0;
  const diff = price - account.position.avgPrice;
  const signed = account.position.side === 'long' ? diff : -diff;
  return signed * account.position.qty * SIM_POINT_VALUE;
}

export function simEquity(account: SimAccountState, price: number): number {
  return simBalance(account) + simUnrealizedPnl(account, price);
}

export function isSimBreached(account: SimAccountState, price: number): boolean {
  return simEquity(account, price) <= SIM_MLL_FLOOR;
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
export function placeSimMarketOrder(account: SimAccountState, side: SimSide, qty: number, price: number, time: number): SimAccountState {
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
  const realized = signed * closingQty * SIM_POINT_VALUE;
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
export function closeSimPosition(account: SimAccountState, price: number, time: number): SimAccountState {
  const pos = account.position;
  if (!pos) return account;
  const diff = price - pos.avgPrice;
  const signed = pos.side === 'long' ? diff : -diff;
  const realized = signed * pos.qty * SIM_POINT_VALUE;
  return {
    ...account,
    realizedPnl: account.realizedPnl + realized,
    position: null,
    trades: [...account.trades, { side: 'flat', qty: pos.qty, price, pnl: realized, time }],
  };
}
