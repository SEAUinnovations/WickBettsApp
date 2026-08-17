import { randomUUID } from "crypto";
import { and, eq, gte, lt, inArray } from "drizzle-orm";
import { db, signalsTable } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { buildStockCandidateList, type RankedCandidate } from "./stockUniverse.js";
import { fetchStockDailyBars, fetchCryptoDailyBars } from "./marketHistory.js";
import { screenSymbol, type ScreenResult } from "./technicalAnalysis.js";
import { blackScholes, pickExpiration, pickStrike, formatExpirationLabel, formatExpirationCode } from "./optionsModel.js";
import { getNewsAlert, fomcWithinRange } from "./economicCalendar.js";
import { getMacroConfluence, type MacroConfluence } from "./macroConfluence.js";

/**
 * The automated signal scanner.
 *
 * Runs a technical screen — RSI(14) at or below 35 (oversold, bullish) or
 * above 70 (overbought, bearish) is a hard requirement; anything in between
 * is filtered out entirely before ranking even starts (see screenSymbol in
 * technicalAnalysis.ts). Within that RSI-qualifying pool, candidates are
 * further ranked by proximity to a rolling 20-day support/resistance level
 * and above-average volume — across a curated universe (popular stocks
 * priced over $90 that sit outside the S&P 500/Nasdaq-100, plus the most
 * popular crypto assets), picks the 1-2 best-fitting setups, and inserts
 * them as "Watching" signals
 * for an admin to review, edit, or delete. Each chosen setup is also
 * assigned a trading "style" (Swing/LEAPS/Buy & Hold — see `pickStyle`
 * below) based on trend conviction, the same way a human would decide
 * whether a setup deserves a short-dated trade or a longer-horizon
 * position: trend-aligned stock setups with a strict technical match become
 * a modeled 6mo+ LEAPS play, trend-aligned setups without a strict match
 * (stocks) or any trend-aligned crypto setup become a Buy & Hold spot
 * position (no hard stop), and everything else stays a short-dated Swing
 * trade — a modeled 7-14 DTE options play for stocks (no live options-chain
 * data source is configured — see optionsModel.ts), a spot Long/Short call
 * for crypto.
 *
 * Every external data dependency here (Nasdaq screener/historical, Wikipedia
 * index constituents, CoinGecko history, Nasdaq earnings calendar) degrades
 * gracefully on failure — a bad fetch just removes that symbol from
 * consideration rather than crashing the run.
 */

const CRYPTO_UNIVERSE = [
  { symbol: "BTC", coingeckoId: "bitcoin", sector: "Store of Value" },
  { symbol: "ETH", coingeckoId: "ethereum", sector: "Smart Contract Platform" },
  { symbol: "SOL", coingeckoId: "solana", sector: "Smart Contract Platform" },
  { symbol: "XRP", coingeckoId: "ripple", sector: "Payments" },
  { symbol: "DOGE", coingeckoId: "dogecoin", sector: "Meme / Payments" },
];

const MIN_SIGNALS_PER_RUN = 1;
const MAX_SIGNALS_PER_RUN = 2;
const STOCK_UNIVERSE_LIMIT = 60;
const FETCH_BATCH_SIZE = 10;
const DEDUP_WINDOW_DAYS = 14;
const SPOT_HOLD_DAYS = 10; // assumed holding window for crypto/spot star-flag checks
// A "Watching" signal that never gets promoted to Active within a week has,
// in practice, never triggered — the setup didn't play out. Left alone these
// pile up and clutter the Signals tab, so they're auto-removed rather than
// kept around like a resolved Active/Closed/Stopped trade (those stay
// forever for transparency — see the "Past signals remain visible" note on
// the Signals tab; an untriggered watch isn't a trade that needs a record).
const WATCHING_EXPIRY_DAYS = 7;

interface Candidate {
  symbol: string;
  market: "Stocks" | "Crypto";
  screen: ScreenResult;
  sector: string | null;
}

type SignalStyle = "Swing" | "Buy & Hold" | "LEAPS";

async function batchScreen<T>(
  items: T[],
  fetchBars: (item: T) => Promise<{ date: string; open: number; high: number; low: number; close: number; volume: number }[]>,
  toSymbol: (item: T) => string,
): Promise<Array<{ symbol: string; screen: ScreenResult }>> {
  const out: Array<{ symbol: string; screen: ScreenResult }> = [];
  for (let i = 0; i < items.length; i += FETCH_BATCH_SIZE) {
    const batch = items.slice(i, i + FETCH_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const bars = await fetchBars(item);
        const screen = screenSymbol(bars);
        return screen ? { symbol: toSymbol(item), screen } : null;
      }),
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) out.push(r.value);
    }
  }
  return out;
}

async function getRecentAutoAssets(): Promise<Set<string>> {
  const cutoff = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  try {
    const rows = await db
      .select({ asset: signalsTable.asset })
      .from(signalsTable)
      .where(
        and(
          eq(signalsTable.source, "auto"),
          inArray(signalsTable.status, ["Active", "Watching"]),
          gte(signalsTable.createdAt, cutoff),
        ),
      );
    return new Set(rows.map((r) => r.asset));
  } catch (err) {
    logger.warn({ err }, "Could not load recent auto-signal assets for dedup — proceeding without dedup this run");
    return new Set();
  }
}

/**
 * Defense-in-depth re-check performed immediately before each insert, on top
 * of the up-front `getRecentAutoAssets` snapshot taken at the start of the
 * run. The snapshot can go stale mid-run — each chosen candidate awaits a
 * news-alert lookup and (for stocks) an options pricing pass before its
 * insert — so this re-verifies against the database at the actual moment of
 * insert rather than trusting a set computed possibly seconds/minutes
 * earlier. This is what actually prevents a duplicate row from landing, not
 * just a duplicate symbol within a single run's selection.
 */
async function hasRecentAutoSignal(symbol: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  try {
    const rows = await db
      .select({ id: signalsTable.id })
      .from(signalsTable)
      .where(
        and(
          eq(signalsTable.asset, symbol),
          eq(signalsTable.source, "auto"),
          inArray(signalsTable.status, ["Active", "Watching"]),
          gte(signalsTable.createdAt, cutoff),
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch (err) {
    logger.warn({ err, symbol }, "Could not run pre-insert dedup check — proceeding, up-front dedup still applies");
    return false;
  }
}

/** Qualitative read on how extreme the RSI reading is, for the thesis narrative. */
function rsiMagnitude(rsi: number, direction: "Long" | "Short"): string {
  if (direction === "Long") {
    if (rsi <= 20) return "deeply oversold";
    return "oversold";
  }
  if (rsi > 80) return "deeply overbought";
  return "overbought";
}

/**
 * Assigns a trading style to a chosen candidate based on trend conviction —
 * the same `trendAligned`/`strictMatch` fields already computed by
 * technicalAnalysis.ts, reused rather than adding a new indicator. A
 * counter-trend or trend-agnostic setup (trendAligned false/null) is a
 * short-dated timing play — Swing. A trend-aligned setup that also cleared
 * the strict technical thresholds is high enough conviction to justify a
 * longer-dated LEAPS contract (stocks only — there's no crypto options
 * builder in this app). A trend-aligned setup that only cleared the looser
 * fallback thresholds (or any trend-aligned crypto setup) becomes a Buy &
 * Hold spot position: real conviction in the direction, but not a precise
 * enough technical trigger to time an options entry against.
 */
function pickStyle(c: Candidate): SignalStyle {
  const { screen, market } = c;
  if (!screen.trendAligned) return "Swing";
  if (market === "Stocks") return screen.strictMatch ? "LEAPS" : "Buy & Hold";
  return "Buy & Hold";
}

/**
 * How far out to set a LEAPS expiration, in months — scales with how
 * extreme the RSI reading is (deeper oversold/overbought = more conviction
 * = more room given). Always at least 6 months out per spec.
 */
function leapsMonthsOut(screen: ScreenResult): number {
  const extreme = screen.direction === "Long" ? screen.rsi <= 20 : screen.rsi >= 80;
  const strong = screen.direction === "Long" ? screen.rsi <= 30 : screen.rsi >= 70;
  if (extreme) return 12;
  if (strong) return 8;
  return 6;
}

function buildAnalysisText(c: Candidate, isFallback: boolean, confluence: MacroConfluence, fomcInWindow: boolean): string {
  const { screen } = c;
  const setupLabel = c.screen.direction === "Long" ? "at support" : "at resistance";
  const level = c.screen.direction === "Long" ? screen.support : screen.resistance;
  const levelLabel = c.screen.direction === "Long" ? "support" : "resistance";
  const prefix = isFallback
    ? `Best available read — RSI is oversold/overbought, but this setup didn't fully clear the strict support/resistance + volume thresholds today: `
    : ``;

  const trendNote =
    screen.trendAligned === null
      ? ""
      : screen.trendAligned
        ? ` Trend context: price is on the ${screen.direction === "Long" ? "right" : "wrong"} side of its 50-day average, ${screen.direction === "Long" ? "consistent with a dip-buy in an uptrend" : "consistent with a fade in a downtrend"} — adds conviction.`
        : ` Trend context: price is against its 50-day average (${screen.direction === "Long" ? "downtrend" : "uptrend"}) — this is a counter-trend bounce/fade play, not a trend-following one, so size and conviction should reflect that.`;

  // Cross-asset confluence (VIX/Dollar/Gold/Bonds) — a secondary decision
  // factor layered on top of the technical screen, not a replacement for
  // it. See macroConfluence.ts for the regime heuristic.
  const macroAligned =
    confluence.regime === "Mixed" ? null : (confluence.regime === "Risk-On") === (screen.direction === "Long");
  const macroNote =
    confluence.regime === "Mixed"
      ? ` ${confluence.note}`
      : ` ${confluence.note} ${macroAligned ? "That backdrop supports this direction." : "That backdrop runs counter to this direction — a headwind worth weighing."}`;

  const rateNote = fomcInWindow
    ? " A Fed rate decision falls inside this trade's window — expect elevated volatility around that date."
    : "";

  return (
    `${prefix}RSI(14) at ${screen.rsi.toFixed(1)} — ${rsiMagnitude(screen.rsi, screen.direction)}, ` +
    `${setupLabel}. Price $${screen.price.toFixed(2)} vs ${levelLabel} $${level.toFixed(2)} ` +
    `(${(screen.proximityPct * 100).toFixed(1)}% away). ` +
    `Volume running ${screen.volumeRatio.toFixed(2)}x the 20-day average${screen.volumeRatio >= 1.3 ? " — real participation behind the move, not a low-volume drift." : "."}` +
    trendNote +
    macroNote +
    rateNote
  );
}

/**
 * A simple "price/cost projector" for the options play: re-prices the same
 * contract at a few what-if checkpoints (flat/time-decay-only, halfway to
 * target, full target, and stop) so the thesis shows how the position's
 * value is expected to move with the underlying and with time/theta —
 * not just a single entry number. These are Black-Scholes estimates off
 * modeled IV, not a live options-chain projection tool, so it's labeled
 * accordingly wherever it's shown.
 */
function buildProjectionNote(
  optionType: "Call" | "Put",
  direction: "Long" | "Short",
  spot: number,
  strike: number,
  dte: number,
  iv: number,
  targetSpot: number,
  stopSpot: number,
): { text: string; targetGreeks: ReturnType<typeof blackScholes>; stopGreeks: ReturnType<typeof blackScholes> } {
  const entry = blackScholes(spot, strike, dte, iv, optionType);
  const halfwaySpot = (spot + targetSpot) / 2;
  const flat = blackScholes(spot, strike, Math.max(Math.round(dte / 2), 1), iv, optionType);
  const halfway = blackScholes(halfwaySpot, strike, Math.max(Math.round(dte * 0.4), 1), iv, optionType);
  const targetGreeks = blackScholes(targetSpot, strike, Math.max(dte - 3, 1), iv, optionType);
  const stopGreeks = blackScholes(stopSpot, strike, Math.max(dte - 1, 1), iv, optionType);

  const pct = (from: number) => (((from - entry.price) / entry.price) * 100).toFixed(0);

  const text =
    `Projection (estimates only — actual pricing will vary with real IV/skew): ` +
    `if the underlying stays flat, ~$${flat.price.toFixed(2)} at the halfway mark (${pct(flat.price)}% from theta decay alone). ` +
    `Halfway to target, ~$${halfway.price.toFixed(2)} (${pct(halfway.price)}%). ` +
    `At target, ~$${targetGreeks.price.toFixed(2)} (${pct(targetGreeks.price)}%). ` +
    `At stop, ~$${stopGreeks.price.toFixed(2)} (${pct(stopGreeks.price)}%). ` +
    `Delta ${entry.delta.toFixed(2)} and theta $${entry.theta.toFixed(2)}/day at entry — expect the contract to move roughly $${Math.abs(entry.delta).toFixed(2)} per $1 the underlying moves, decaying by about $${Math.abs(entry.theta).toFixed(2)}/day if price sits still.`;

  return { text, targetGreeks, stopGreeks };
}

async function buildStockOptionSignal(
  c: Candidate,
  newsAlert: { flagged: boolean; note: string | null },
  confluence: MacroConfluence,
  fomcInWindow: boolean,
  style: "Swing" | "LEAPS",
) {
  const { screen } = c;
  const isFallback = !screen.strictMatch;
  const isLeaps = style === "LEAPS";
  const optionType: "Call" | "Put" = c.screen.direction === "Long" ? "Call" : "Put";
  // Swing stays the original 7-14 DTE window. LEAPS targets a Friday near
  // the conviction-scaled month mark from leapsMonthsOut, clamped to never
  // land under 6 months out.
  const expirationDate = isLeaps
    ? (() => {
        const anchorDays = Math.round(leapsMonthsOut(screen) * 30.44);
        return pickExpiration(new Date(), Math.max(anchorDays - 7, 180), anchorDays + 7);
      })()
    : pickExpiration(new Date(), 7, 14);
  const dte = Math.round((expirationDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const strike = pickStrike(screen.price, c.screen.direction);
  const iv = screen.realizedVol && screen.realizedVol > 0 ? screen.realizedVol : 0.4;

  const entryGreeks = blackScholes(screen.price, strike, dte, iv, optionType);
  // Target: underlying reaches the opposite level (resistance for a call
  // setup, support for a put setup), option re-priced at that spot with a
  // few fewer days on the clock. Stop: underlying breaks back through the
  // level that defined the setup in the first place. LEAPS extrapolates
  // the same near-term support/resistance move out further (a multi-month
  // thesis should be sized on a bigger expected move than a 1-2 week
  // swing) and gives the underlying more room before invalidating the
  // thesis on the way there.
  const targetSpot = isLeaps
    ? c.screen.direction === "Long"
      ? screen.price + (screen.resistance - screen.price) * 3
      : screen.price - (screen.price - screen.support) * 3
    : c.screen.direction === "Long"
      ? screen.resistance
      : screen.support;
  const stopSpot = isLeaps
    ? c.screen.direction === "Long"
      ? screen.support * 0.95
      : screen.resistance * 1.05
    : c.screen.direction === "Long"
      ? screen.support * 0.985
      : screen.resistance * 1.015;

  const projection = buildProjectionNote(
    optionType,
    c.screen.direction,
    screen.price,
    strike,
    dte,
    iv,
    targetSpot,
    stopSpot,
  );
  const targetGreeks = projection.targetGreeks;
  const stopGreeks = projection.stopGreeks;

  const contract = `${c.symbol} ${formatExpirationCode(expirationDate)} ${strike} ${optionType === "Call" ? "C" : "P"}`;

  return {
    id: randomUUID(),
    asset: c.symbol,
    sector: c.sector,
    market: "Stocks" as const,
    direction: c.screen.direction,
    status: "Watching" as const,
    entry: `$${entryGreeks.price.toFixed(2)}`,
    target: `$${targetGreeks.price.toFixed(2)}`,
    stop: `$${stopGreeks.price.toFixed(2)}`,
    timeframe: `${formatExpirationLabel(expirationDate)} expiry`,
    risk: "Medium",
    style,
    analysis:
      buildAnalysisText(c, isFallback, confluence, fomcInWindow) +
      ` Premium and Greeks below are MODELED (Black-Scholes off ${(iv * 100).toFixed(0)}% realized volatility) — there is no live options-chain data source configured, so verify real bid/ask before publishing. ` +
      projection.text +
      (isLeaps
        ? ` Structured as a longer-dated LEAPS position (${formatExpirationLabel(expirationDate)}, ~${dte} days out) to give the trend room to play out rather than timing a short-term bounce — size and expect price swings accordingly given the extended time horizon.`
        : "") +
      (newsAlert.flagged ? ` ⚠ ${newsAlert.note}` : ""),
    isOption: true,
    optionType,
    contract,
    expiration: formatExpirationLabel(expirationDate),
    strike: `$${strike.toFixed(2)}`,
    premium: `$${entryGreeks.price.toFixed(2)}`,
    bid: `$${Math.max(entryGreeks.price - 0.05, 0.01).toFixed(2)}`,
    ask: `$${(entryGreeks.price + 0.05).toFixed(2)}`,
    impliedVolatility: `${(iv * 100).toFixed(1)}%`,
    delta: Number(entryGreeks.delta.toFixed(3)),
    gamma: Number(entryGreeks.gamma.toFixed(4)),
    theta: Number(entryGreeks.theta.toFixed(3)),
    vega: Number(entryGreeks.vega.toFixed(3)),
    openInterest: null,
    source: "auto" as const,
    newsAlert: newsAlert.flagged,
    newsAlertNote: newsAlert.note,
  };
}

/**
 * Buy & Hold stock signal: a plain spot position, not an options play (the
 * schema/admin rules require Buy & Hold ↔ isOption: false, mirroring
 * LEAPS/Swing ↔ isOption: true — see routes/signals.ts). No hard stop
 * (the `stop` column is nullable specifically for this style); target is
 * the same near-term support/resistance move extrapolated further out,
 * same reasoning as the LEAPS branch above.
 */
function buildStockBuyHoldSignal(
  c: Candidate,
  newsAlert: { flagged: boolean; note: string | null },
  confluence: MacroConfluence,
  fomcInWindow: boolean,
) {
  const { screen } = c;
  const isFallback = !screen.strictMatch;
  const target =
    c.screen.direction === "Long"
      ? screen.price + (screen.resistance - screen.price) * 3
      : screen.price - (screen.price - screen.support) * 3;

  return {
    id: randomUUID(),
    asset: c.symbol,
    sector: c.sector,
    market: "Stocks" as const,
    direction: c.screen.direction,
    status: "Watching" as const,
    entry: `$${screen.price.toFixed(2)}`,
    target: `$${target.toFixed(2)}`,
    stop: null,
    timeframe: "Long-term hold (6-12mo+)",
    risk: "Medium",
    style: "Buy & Hold" as const,
    analysis:
      buildAnalysisText(c, isFallback, confluence, fomcInWindow) +
      " Structured as a long-term accumulation position — no fixed expiration or hard stop; the thesis is meant to play out over months, not days." +
      (newsAlert.flagged ? ` ⚠ ${newsAlert.note}` : ""),
    isOption: false,
    optionType: null,
    contract: null,
    expiration: null,
    strike: null,
    premium: null,
    bid: null,
    ask: null,
    impliedVolatility: null,
    delta: null,
    gamma: null,
    theta: null,
    vega: null,
    openInterest: null,
    source: "auto" as const,
    newsAlert: newsAlert.flagged,
    newsAlertNote: newsAlert.note,
  };
}

function buildCryptoSpotSignal(
  c: Candidate,
  newsAlert: { flagged: boolean; note: string | null },
  confluence: MacroConfluence,
  fomcInWindow: boolean,
  style: "Swing" | "Buy & Hold",
) {
  const { screen } = c;
  const isFallback = !screen.strictMatch;
  const isBuyHold = style === "Buy & Hold";
  // Buy & Hold extrapolates the same near-term S/R move out further (a
  // multi-month thesis, not a 1-2 week swing) and drops the hard stop —
  // same reasoning as the stock LEAPS/Buy & Hold branches above.
  const target = isBuyHold
    ? c.screen.direction === "Long"
      ? screen.price + (screen.resistance - screen.price) * 3
      : screen.price - (screen.price - screen.support) * 3
    : c.screen.direction === "Long"
      ? screen.resistance
      : screen.support;
  const stop = isBuyHold
    ? null
    : c.screen.direction === "Long"
      ? screen.support * 0.97
      : screen.resistance * 1.03;

  return {
    id: randomUUID(),
    asset: c.symbol,
    sector: c.sector,
    market: "Crypto" as const,
    direction: c.screen.direction,
    status: "Watching" as const,
    entry: `$${screen.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
    target: `$${target.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
    stop: stop == null ? null : `$${stop.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
    timeframe: isBuyHold ? "Long-term hold (6-12mo+)" : "Daily swing",
    risk: "Medium",
    style,
    analysis:
      buildAnalysisText(c, isFallback, confluence, fomcInWindow) +
      (isBuyHold
        ? " Structured as a long-term accumulation position — no fixed hard stop; the thesis is meant to play out over months, not days."
        : "") +
      (newsAlert.flagged ? ` ⚠ ${newsAlert.note}` : ""),
    isOption: false,
    optionType: null,
    contract: null,
    expiration: null,
    strike: null,
    premium: null,
    bid: null,
    ask: null,
    impliedVolatility: null,
    delta: null,
    gamma: null,
    theta: null,
    vega: null,
    openInterest: null,
    source: "auto" as const,
    newsAlert: newsAlert.flagged,
    newsAlertNote: newsAlert.note,
  };
}

// How much a cross-asset confluence alignment/misalignment nudges a
// candidate's rank versus a competing setup — modest relative to typical
// technical scores (rsiGap alone can run into the teens/20s) so a strongly
// qualified technical setup never gets bumped by macro alone; it only
// tips close calls between similarly-scored candidates.
const MACRO_SCORE_WEIGHT = 1.5;
// Flat penalty (not directional — a rate decision adds uncertainty
// regardless of which way a candidate is positioned) applied when the
// trade's expected window contains an FOMC decision.
const FOMC_WINDOW_PENALTY = 1;

export async function runSignalScan(): Promise<void> {
  logger.info("Auto signal scan starting");
  try {
    const [stockCandidates, confluence] = await Promise.all([
      buildStockCandidateList(STOCK_UNIVERSE_LIMIT),
      getMacroConfluence(),
    ]);
    // Sector lookups keyed off the same screener pass that built the
    // candidate list, so every stock candidate can be labeled without a
    // second network round-trip; crypto sectors are the static category on
    // CRYPTO_UNIVERSE itself.
    const stockSectorBySymbol = new Map(stockCandidates.map((c) => [c.symbol, c.sector]));
    const cryptoSectorBySymbol = new Map(CRYPTO_UNIVERSE.map((c) => [c.symbol, c.sector]));
    const stockSymbols = stockCandidates.map((c) => c.symbol);

    const [stockResults, cryptoResults] = await Promise.all([
      batchScreen(
        stockSymbols,
        (symbol) => fetchStockDailyBars(symbol),
        (symbol) => symbol,
      ),
      batchScreen(
        CRYPTO_UNIVERSE,
        (c) => fetchCryptoDailyBars(c.coingeckoId),
        (c) => c.symbol,
      ),
    ]);

    const allCandidates: Candidate[] = [
      ...stockResults.map((r) => ({ symbol: r.symbol, market: "Stocks" as const, screen: r.screen, sector: stockSectorBySymbol.get(r.symbol) ?? null })),
      ...cryptoResults.map((r) => ({ symbol: r.symbol, market: "Crypto" as const, screen: r.screen, sector: cryptoSectorBySymbol.get(r.symbol) ?? null })),
    ];

    if (allCandidates.length === 0) {
      logger.warn("Auto signal scan found zero usable candidates (all data fetches failed) — no signals created this run");
      return;
    }

    logger.info(
      { regime: confluence.regime, score: confluence.score, legs: confluence.legs },
      "Macro confluence read for this scan",
    );

    // FOMC-window check only depends on market (the holding window is the
    // same for every stock candidate, and separately the same for every
    // crypto candidate), so compute it twice total rather than per-symbol —
    // unlike earnings, FOMC dates aren't symbol-specific.
    const now = new Date();
    const stockWindowEnd = new Date(now);
    stockWindowEnd.setUTCDate(stockWindowEnd.getUTCDate() + 14);
    const cryptoWindowEnd = new Date(now);
    cryptoWindowEnd.setUTCDate(cryptoWindowEnd.getUTCDate() + SPOT_HOLD_DAYS);
    const stockFomcInWindow = fomcWithinRange(now, stockWindowEnd);
    const cryptoFomcInWindow = fomcWithinRange(now, cryptoWindowEnd);
    const fomcInWindowFor = (market: "Stocks" | "Crypto") => (market === "Stocks" ? stockFomcInWindow : cryptoFomcInWindow);

    // Ranking score layers the macro confluence read and FOMC-window caution
    // on top of the pure technical score (technicalAnalysis.ts's screen.score
    // stays untouched — this is a selection-time nudge, not a rewrite of the
    // technical screen itself).
    const rankScore = (c: Candidate): number => {
      let s = c.screen.score;
      if (confluence.regime !== "Mixed") {
        const aligned = (confluence.regime === "Risk-On") === (c.screen.direction === "Long");
        s += aligned ? MACRO_SCORE_WEIGHT : -MACRO_SCORE_WEIGHT;
      }
      if (fomcInWindowFor(c.market)) s -= FOMC_WINDOW_PENALTY;
      return s;
    };

    const recentAssets = await getRecentAutoAssets();
    // Deliberately no "fall back to the full undeduped pool" branch here —
    // that used to be the actual cause of duplicate signals: whenever every
    // qualifying candidate already had a recent Watching/Active auto signal,
    // the old code discarded the dedup filter entirely and happily re-added
    // a second signal for a ticker that already had one live. Producing
    // fewer (or zero) signals this run is correct; duplicating an existing
    // one is not.
    const pool = allCandidates.filter((c) => !recentAssets.has(c.symbol));

    const strict = pool.filter((c) => c.screen.strictMatch).sort((a, b) => rankScore(b) - rankScore(a));
    const rest = pool.filter((c) => !c.screen.strictMatch).sort((a, b) => rankScore(b) - rankScore(a));
    const ranked = [...strict, ...rest];

    // Cap to MAX_SIGNALS_PER_RUN, avoiding duplicate symbols within the run.
    const chosen: Candidate[] = [];
    const usedSymbols = new Set<string>();
    for (const c of ranked) {
      if (chosen.length >= MAX_SIGNALS_PER_RUN) break;
      if (usedSymbols.has(c.symbol)) continue;
      chosen.push(c);
      usedSymbols.add(c.symbol);
    }

    if (chosen.length < MIN_SIGNALS_PER_RUN && ranked.length > 0) {
      chosen.push(ranked[0]);
    }

    const inserted: string[] = [];
    for (const c of chosen) {
      // Re-verify right before insert — see hasRecentAutoSignal's doc
      // comment for why the up-front `recentAssets` snapshot alone isn't
      // sufficient.
      if (await hasRecentAutoSignal(c.symbol)) {
        logger.info({ symbol: c.symbol }, "Skipped auto signal insert — a recent Watching/Active signal already exists for this asset");
        continue;
      }
      const windowEnd = new Date();
      windowEnd.setUTCDate(windowEnd.getUTCDate() + (c.market === "Stocks" ? 14 : SPOT_HOLD_DAYS));
      const newsAlert = await getNewsAlert(c.symbol, c.market, new Date(), windowEnd);
      const fomcInWindow = fomcInWindowFor(c.market);
      const style = pickStyle(c);

      const record =
        c.market === "Stocks"
          ? style === "Buy & Hold"
            ? buildStockBuyHoldSignal(c, newsAlert, confluence, fomcInWindow)
            : await buildStockOptionSignal(c, newsAlert, confluence, fomcInWindow, style)
          : buildCryptoSpotSignal(c, newsAlert, confluence, fomcInWindow, style === "LEAPS" ? "Swing" : style);

      try {
        await db.insert(signalsTable).values(record as never);
        inserted.push(c.symbol);
      } catch (err) {
        logger.error({ err, symbol: c.symbol }, "Failed to insert auto-generated signal");
      }
    }

    logger.info({ inserted, scanned: allCandidates.length }, "Auto signal scan complete");
  } catch (err) {
    logger.error({ err }, "Auto signal scan failed");
  }
}

/**
 * Deletes any signal still sitting in "Watching" after WATCHING_EXPIRY_DAYS —
 * manual or auto, it doesn't matter which; a setup nobody promoted to Active
 * in a week is just clutter on the Signals tab at that point. Active/Closed/
 * Stopped signals are never touched here, regardless of age.
 */
export async function expireStaleWatchingSignals(): Promise<void> {
  const cutoff = new Date(Date.now() - WATCHING_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  try {
    const removed = await db
      .delete(signalsTable)
      .where(and(eq(signalsTable.status, "Watching"), lt(signalsTable.createdAt, cutoff)))
      .returning({ id: signalsTable.id, asset: signalsTable.asset });
    if (removed.length > 0) {
      logger.info(
        { count: removed.length, assets: removed.map((r) => r.asset) },
        "Auto-removed stale Watching signals older than a week",
      );
    }
  } catch (err) {
    logger.error({ err }, "Failed to expire stale Watching signals");
  }
}

const RUN_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000; // every 2 days
let schedulerStarted = false;

export function startSignalScanScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  // Run once shortly after boot so the Signals tab has real data immediately
  // instead of waiting up to 2 days for the first scheduled pass, then every
  // 2 days after that. The Watching-signal cleanup rides the same cadence —
  // no need for its own timer, and every-2-days is frequent enough to keep a
  // 7-day expiry from ever drifting more than a couple of days late.
  setTimeout(() => {
    void runSignalScan();
    void expireStaleWatchingSignals();
  }, 20_000);
  setInterval(() => {
    void runSignalScan();
    void expireStaleWatchingSignals();
  }, RUN_INTERVAL_MS);
}

startSignalScanScheduler();
