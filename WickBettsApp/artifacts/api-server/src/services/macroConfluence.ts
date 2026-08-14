import { logger } from "../lib/logger.js";
import { fetchStockDailyBars } from "./marketHistory.js";

/**
 * Cross-asset "confluence" read — VIX, the Dollar, Gold, and Bonds — used as
 * a secondary decision factor alongside the per-symbol technical screen
 * (technicalAnalysis.ts). This never overrides the RSI/support-resistance/
 * volume setup; it nudges which qualifying candidates get selected for the
 * day's watch signals (see rankScore in signalScanner.ts) and adds macro
 * context to the published thesis.
 *
 * Instruments tracked — all liquid, US-listed ETFs reachable through the
 * same Nasdaq quote/historical API the rest of the scanner already uses, so
 * this adds no new data source:
 *   VIXY — ProShares VIX Short-Term Futures ETF, proxy for the VIX. Not a
 *     perfect tracker (futures-based ETFs suffer contango decay over long
 *     holds), but directionally reliable over the short lookback used here.
 *   UUP  — Invesco DB US Dollar Index Bullish Fund, proxy for the Dollar
 *     Index (DXY itself isn't Nasdaq-quotable).
 *   GLD  — Gold, already tracked elsewhere in the app (routes/market.ts).
 *   TLT  — 20+ Year Treasury ETF. Price moves inverse to long-end yields,
 *     so TLT strength = falling yields (dovish/rate-cut expectations) and
 *     TLT weakness = rising yields (hawkish/rate-hold expectations). This
 *     is the market-implied stand-in for "interest rate direction" used
 *     here — there's no live Fed funds rate/dot-plot feed wired into this
 *     app. Actual FOMC *date* proximity is handled separately in
 *     economicCalendar.ts (fomcWithinRange), since that's a known
 *     deterministic schedule rather than something to infer from price.
 *
 * Regime heuristic (standard cross-asset risk read): risk-on price action
 * is VIX falling, Dollar weakening, Gold cooling, and yields rising (bonds
 * selling off) as capital rotates out of safety into risk assets. Risk-off
 * is the mirror image — VIX up, Dollar up, Gold up, bonds bid (yields
 * falling). All four legs share the same up=risk-off / down=risk-on
 * polarity, which keeps the scoring uniform below.
 */

export type LegTrend = "up" | "down" | "flat" | "unavailable";
export type MacroRegime = "Risk-On" | "Risk-Off" | "Mixed";

export interface MacroConfluence {
  regime: MacroRegime;
  /** Sum of per-leg contributions, roughly -4..+4. Positive = risk-on. */
  score: number;
  legs: {
    vix: LegTrend;
    dollar: LegTrend;
    gold: LegTrend;
    bonds: LegTrend;
  };
  /** Human-readable summary for the published thesis text. */
  note: string;
  fetchedAt: number;
}

interface Instrument {
  key: keyof MacroConfluence["legs"];
  symbol: string;
  label: string;
  /** Fraction move over LOOKBACK sessions considered "notable" for this instrument. */
  threshold: number;
}

const INSTRUMENTS: Instrument[] = [
  { key: "vix", symbol: "VIXY", label: "VIX", threshold: 0.08 },
  { key: "dollar", symbol: "UUP", label: "the Dollar", threshold: 0.012 },
  { key: "gold", symbol: "GLD", label: "Gold", threshold: 0.025 },
  { key: "bonds", symbol: "TLT", label: "Bonds", threshold: 0.02 },
];

const LOOKBACK_SESSIONS = 10;
const CACHE_TTL_MS = 15 * 60 * 1000;

let cache: { value: MacroConfluence; fetchedAt: number } | null = null;

function classify(pctChange: number, threshold: number): LegTrend {
  if (Math.abs(pctChange) < threshold) return "flat";
  return pctChange > 0 ? "up" : "down";
}

function legScore(trend: LegTrend): number {
  // Up = risk-off (-1), down = risk-on (+1), flat/unavailable = neutral (0)
  // for every instrument tracked here — see module doc for why.
  if (trend === "up") return -1;
  if (trend === "down") return 1;
  return 0;
}

async function fetchLeg(instrument: Instrument): Promise<LegTrend> {
  try {
    const bars = await fetchStockDailyBars(instrument.symbol, 30, "etf");
    if (bars.length < LOOKBACK_SESSIONS + 1) return "unavailable";
    const recent = bars.slice(-(LOOKBACK_SESSIONS + 1));
    const from = recent[0].close;
    const to = recent[recent.length - 1].close;
    if (!from || !to) return "unavailable";
    const pctChange = (to - from) / from;
    return classify(pctChange, instrument.threshold);
  } catch (err) {
    logger.debug({ err, symbol: instrument.symbol }, "Macro confluence leg fetch failed");
    return "unavailable";
  }
}

function buildNote(legs: MacroConfluence["legs"], regime: MacroRegime): string {
  const describe = (label: string, trend: LegTrend) =>
    trend === "unavailable" ? null : `${label} ${trend === "flat" ? "flat" : trend}`;

  const parts = [
    describe("VIX", legs.vix),
    describe("Dollar", legs.dollar),
    describe("Gold", legs.gold),
    describe("Bonds", legs.bonds),
  ].filter((p): p is string => p !== null);

  if (parts.length === 0) return "Macro confluence unavailable this run.";

  const regimeLabel =
    regime === "Risk-On" ? "risk-on confluence" : regime === "Risk-Off" ? "risk-off confluence" : "mixed cross-asset signals";

  return `Cross-asset read: ${parts.join(", ")} — ${regimeLabel}.`;
}

async function computeMacroConfluence(): Promise<MacroConfluence> {
  const results = await Promise.allSettled(INSTRUMENTS.map(fetchLeg));
  const legs: MacroConfluence["legs"] = { vix: "unavailable", dollar: "unavailable", gold: "unavailable", bonds: "unavailable" };

  INSTRUMENTS.forEach((instrument, i) => {
    const r = results[i];
    legs[instrument.key] = r.status === "fulfilled" ? r.value : "unavailable";
  });

  const score = Object.values(legs).reduce((sum, trend) => sum + legScore(trend), 0);
  const regime: MacroRegime = score >= 2 ? "Risk-On" : score <= -2 ? "Risk-Off" : "Mixed";
  const note = buildNote(legs, regime);

  return { regime, score, legs, note, fetchedAt: Date.now() };
}

/**
 * Cached macro confluence read — one computation shared across an entire
 * scanner run (and any other caller within the TTL window) rather than
 * re-fetched per candidate. Never throws; a total failure degrades to a
 * "Mixed" / all-unavailable read rather than blocking the scan.
 */
export async function getMacroConfluence(): Promise<MacroConfluence> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.value;
  }
  try {
    const value = await computeMacroConfluence();
    cache = { value, fetchedAt: Date.now() };
    return value;
  } catch (err) {
    logger.warn({ err }, "Macro confluence computation failed — proceeding with a neutral read");
    const fallback: MacroConfluence = {
      regime: "Mixed",
      score: 0,
      legs: { vix: "unavailable", dollar: "unavailable", gold: "unavailable", bonds: "unavailable" },
      note: "Macro confluence unavailable this run.",
      fetchedAt: Date.now(),
    };
    cache = { value: fallback, fetchedAt: Date.now() };
    return fallback;
  }
}
