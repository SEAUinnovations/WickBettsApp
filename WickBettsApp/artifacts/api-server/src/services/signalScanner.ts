import { randomUUID } from "crypto";
import { and, eq, gte, lt, inArray } from "drizzle-orm";
import { db, signalsTable } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { buildStockCandidateList, type RankedCandidate } from "./stockUniverse.js";
import { fetchStockDailyBars, fetchCryptoDailyBars } from "./marketHistory.js";
import { fetchFuturesHourlyBars, resampleTo4Hour } from "./intradayData.js";
import { screenSymbol, type ScreenResult } from "./technicalAnalysis.js";
import { blackScholes, pickExpiration, pickStrike, formatExpirationLabel, formatExpirationCode } from "./optionsModel.js";
import { fetchOptionsChain, selectContract, contractMidPrice, type ChainContract } from "./optionsChain.js";
import { getNewsAlert, fomcWithinRange } from "./economicCalendar.js";
import { getMacroConfluence, type MacroConfluence } from "./macroConfluence.js";
import { sendDailyDayTradeDigest } from "../utils/emailNotifications.js";

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
 * below): for STOCKS, a trend-aligned setup that also clears the strict
 * technical thresholds becomes a modeled 6mo+ LEAPS options contract —
 * the one case where a stock signal has a strike/premium/Greeks — and
 * every other stock setup becomes a Buy & Hold spot position instead (just
 * the stock price and an entry, no options contract, no hard stop): a
 * stock play is fundamentally "buy the shares." For CRYPTO (no options
 * builder in this app at all), a trend-aligned setup becomes Buy & Hold
 * (spot, no stop), everything else stays a short-dated Swing spot
 * Long/Short (has a stop).
 *
 * runSignalScan (this scan) additionally guarantees at least LEAPS_MIN_PER_RUN
 * LEAPS-style signals every run via a top-up pass — see the comment right
 * before that pass, near the end of the function, for why the ranked
 * selection alone doesn't already guarantee this.
 *
 * A second, separate scan lives in this same file: runDayTradeScan, on its
 * own daily schedule (startDayTradeScanScheduler, below) rather than this
 * scan's 2-day one. It's a genuinely different instrument class, not
 * stocks/crypto — CME index/metals FUTURES (MES/MNQ/ES/NQ/MGC — see
 * DAY_TRADE_UNIVERSE), screened on 4-hour bars (resampled from hourly —
 * see intradayData.ts), and only ever published when the setup clears a
 * minimum 1:3 reward:risk (MIN_RISK_REWARD) — see buildFuturesDayTradeSignal.
 * In short: Buy & Hold = plain shares (stocks) or spot (crypto), LEAPS =
 * stock options contract, Day Trade = futures contract, Swing = crypto
 * spot only (no longer a stock style — see pickStyle).
 *
 * Every external data dependency here (Nasdaq screener/historical, Wikipedia
 * index constituents, CoinGecko history, Nasdaq earnings calendar, Yahoo
 * Finance hourly futures chart) degrades gracefully on failure — a bad
 * fetch just removes that symbol from consideration rather than crashing
 * the run.
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

// Every 2-day run must produce at least this many LEAPS-style signals — see
// the top-up pass at the end of runSignalScan. The normal ranked selection
// alone doesn't guarantee this (LEAPS only happens to come out of pickStyle
// when a trend-aligned stock candidate also clears the strict technical
// thresholds), so a dedicated pass forces it when the normal pass falls
// short, same as MIN_SIGNALS_PER_RUN forces at least one signal overall.
const LEAPS_MIN_PER_RUN = 2;

// Real-chain / classification rules for stock options plays (see
// buildStockOptionSignal). $20/share = $2,000 per 100-share contract — the
// ceiling the scanner enforces on any options call-out, whether the price
// comes from a real quote (preferred) or, when no live chain is available,
// the modeled Black-Scholes estimate — so a member is never pointed at a
// contract more expensive than that to size into.
const MAX_CONTRACT_PREMIUM = 20;
// A contract's published style is driven by its ACTUAL expiration, not the
// scanner's target window: real options chains don't always have an
// expiration near the ideal LEAPS-conviction target (smaller/less liquid
// names especially list fewer dated-out expirations), so a setup aiming for
// 6mo+ conviction can still end up on the nearest real expiration that's
// actually available. Under this many days out counts as a Swing options
// play; this many days or more counts as a LEAPS one.
const SWING_LEAP_THRESHOLD_DAYS = 182; // ~6 months
// How far past the ideal OTM strike the modeled fallback (used only when no
// real chain data is available at all) is willing to push in order to bring
// the modeled premium under MAX_CONTRACT_PREMIUM.
const MAX_MODELED_OTM_PERCENT = 0.25;

/**
 * Curated universe for the day-trade scan (runDayTradeScan) — CME index and
 * metals futures, not stocks. Yahoo's continuous-contract ticker convention
 * uses a "=F" suffix; `asset` is the plain, human-facing contract symbol
 * stored on the signal (see routes/signals.ts and the mobile Signals tab).
 * MES/MNQ are the micro (1/10th size) contracts, ES/NQ the full-size E-minis,
 * MGC the micro gold contract — a deliberately small, singularly liquid
 * universe rather than a broad screen, since futures day-trade call-outs
 * need the deepest, tightest-spread instruments, not breadth.
 */
const DAY_TRADE_UNIVERSE: { yahooSymbol: string; asset: string; sector: string }[] = [
  { yahooSymbol: "MES=F", asset: "MES", sector: "Index Futures" },
  { yahooSymbol: "MNQ=F", asset: "MNQ", sector: "Index Futures" },
  { yahooSymbol: "ES=F", asset: "ES", sector: "Index Futures" },
  { yahooSymbol: "NQ=F", asset: "NQ", sector: "Index Futures" },
  { yahooSymbol: "MGC=F", asset: "MGC", sector: "Metals Futures" },
];
// No MIN constant here, deliberately — zero inserts in a run is a valid,
// expected outcome (see MIN_RISK_REWARD below). This universe is only 5
// symbols, and the gate is "RSI extreme + a confirmed structure setup + at
// least a 1:3 reward:risk" all at once; on most days that combination
// legitimately won't exist for any of the 5. Forcing a signal out anyway
// (the way MIN_SIGNALS_PER_RUN=1 does for the swing/LEAPS scan) would mean
// publishing a trade that doesn't actually clear the risk:reward bar this
// scan exists to enforce — worse than publishing nothing that day.
const DAY_TRADE_MAX_PER_RUN = 3;
// Minimum acceptable reward:risk — "only look for trades... of 1:4, 1:3."
// A candidate whose structural target/stop don't clear 3x is skipped
// entirely rather than published with a worse ratio or an artificially
// stretched target that ignores real structure.
const MIN_RISK_REWARD = 3;
// Shorter than DEDUP_WINDOW_DAYS on purpose — day trades are meant to
// refresh daily against the same small liquid universe, so a 14-day window
// would make the same futures permanently ineligible after their first
// appearance. 20h (not a flat 24h) means a scan that drifts a bit later
// each day (setInterval isn't wall-clock-exact — see the scheduler below)
// never accidentally skips a symbol that's actually eligible again.
const DAY_TRADE_DEDUP_HOURS = 20;
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

async function getRecentAutoDayTradeAssets(): Promise<Set<string>> {
  const cutoff = new Date(Date.now() - DAY_TRADE_DEDUP_HOURS * 60 * 60 * 1000);
  try {
    const rows = await db
      .select({ asset: signalsTable.asset })
      .from(signalsTable)
      .where(
        and(
          eq(signalsTable.source, "auto"),
          eq(signalsTable.style, "Day Trade"),
          inArray(signalsTable.status, ["Active", "Watching"]),
          gte(signalsTable.createdAt, cutoff),
        ),
      );
    return new Set(rows.map((r) => r.asset));
  } catch (err) {
    logger.warn({ err }, "Could not load recent auto day-trade assets for dedup — proceeding without dedup this run");
    return new Set();
  }
}

async function hasRecentAutoDayTradeSignal(symbol: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - DAY_TRADE_DEDUP_HOURS * 60 * 60 * 1000);
  try {
    const rows = await db
      .select({ id: signalsTable.id })
      .from(signalsTable)
      .where(
        and(
          eq(signalsTable.asset, symbol),
          eq(signalsTable.source, "auto"),
          eq(signalsTable.style, "Day Trade"),
          inArray(signalsTable.status, ["Active", "Watching"]),
          gte(signalsTable.createdAt, cutoff),
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch (err) {
    logger.warn({ err, symbol }, "Could not run pre-insert day-trade dedup check — proceeding, up-front dedup still applies");
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
 * technicalAnalysis.ts, reused rather than adding a new indicator.
 *
 * Stocks: this function itself only ever picks between "LEAPS" (attempt an
 * options play) and "Buy & Hold" (plain shares, no options contract) — a
 * trend-aligned setup that also clears the strict technical thresholds is
 * high enough conviction to justify a longer-dated options contract; every
 * other stock setup is a Buy & Hold spot position instead (real conviction
 * in the direction, or for a counter-trend read that context is disclosed
 * in the thesis text — see buildAnalysisText — but no options contract).
 * What buildStockOptionSignal actually PUBLISHES for the "LEAPS" case can
 * still come back styled "Swing": it searches a real options chain anchored
 * on a 6mo+ target, but a real chain doesn't always have an expiration that
 * far out for every ticker, so the final style reflects whatever expiration
 * was actually available (see SWING_LEAP_THRESHOLD_DAYS), not this
 * function's up-front guess.
 *
 * Crypto: unaffected by the above — there's no crypto options builder in
 * this app at all, so Swing here just means a short-dated spot Long/Short
 * with a hard stop (trendAligned false/null), versus Buy & Hold's
 * long-term spot accumulation with no stop (trendAligned true).
 */
function pickStyle(c: Candidate): SignalStyle {
  const { screen, market } = c;
  if (market === "Stocks") {
    return screen.trendAligned && screen.strictMatch ? "LEAPS" : "Buy & Hold";
  }
  return screen.trendAligned ? "Buy & Hold" : "Swing";
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

/**
 * Builds a stock options signal for the LEAPS-conviction gate (trend-aligned
 * + strict technical match — see pickStyle). Tries a REAL options chain
 * first (optionsChain.ts, Yahoo Finance) so the published contract's
 * strike/expiration/bid/ask/open interest/IV are real market data, not a
 * guess; only falls back to a modeled Black-Scholes contract when no real
 * chain is available at all (symbol not optionable, fetch failure, etc.).
 *
 * The persisted `style` (Swing vs LEAPS) is decided from the ACTUAL
 * expiration landed on — see SWING_LEAP_THRESHOLD_DAYS — not assumed up
 * front, since a real chain doesn't always have an expiration near the
 * ideal 6-12mo conviction target. Every contract, real or modeled, is kept
 * at or under MAX_CONTRACT_PREMIUM per share ($2,000/contract); if nothing
 * available clears that cap, this returns null and the caller skips the
 * candidate entirely rather than publish an unaffordable contract.
 */
async function buildStockOptionSignal(
  c: Candidate,
  newsAlert: { flagged: boolean; note: string | null },
  confluence: MacroConfluence,
  fomcInWindow: boolean,
): Promise<ReturnType<typeof buildOptionSignalRecord> | null> {
  const { screen } = c;
  const optionType: "Call" | "Put" = c.screen.direction === "Long" ? "Call" : "Put";
  const idealStrike = pickStrike(screen.price, c.screen.direction);

  // Ideal search window: a Friday near the conviction-scaled month mark
  // from leapsMonthsOut (6/8/12mo) — the thesis this scanner is built
  // around is a multi-month one, so this is always the FIRST thing tried,
  // real chain permitting. What actually gets published can still land
  // under 6 months (see the doc comment above) when that's genuinely the
  // best a real chain offers for this ticker.
  const anchorDays = Math.round(leapsMonthsOut(screen) * 30.44);
  const targetMinDays = Math.max(anchorDays - 14, 30);
  const targetMaxDays = anchorDays + 14;

  let strike = idealStrike;
  let expirationDate = pickExpiration(new Date(), Math.max(anchorDays - 7, 180), anchorDays + 7);
  let iv = screen.realizedVol && screen.realizedVol > 0 ? screen.realizedVol : 0.4;
  let premiumOverride: number | null = null;
  let realQuote: ChainContract | null = null;

  const chain = await fetchOptionsChain(c.symbol, targetMinDays, targetMaxDays);
  if (chain) {
    const picked = selectContract(chain, optionType, idealStrike, MAX_CONTRACT_PREMIUM);
    if (picked) {
      realQuote = picked;
      strike = picked.strike;
      expirationDate = picked.expirationDate;
      if (picked.impliedVolatility > 0) iv = picked.impliedVolatility;
      premiumOverride = contractMidPrice(picked);
    }
  }

  // No real contract under the cap (no chain at all, or every real strike
  // priced above MAX_CONTRACT_PREMIUM) — fall back to the modeled contract,
  // pushing the strike further OTM as needed to bring the MODELED premium
  // under the same cap. If even the maximum allowed OTM push can't get
  // there (very high-priced/high-IV underlying), skip this candidate
  // entirely rather than publish something over budget.
  if (!realQuote) {
    let otmPercent = 0.03;
    let modeled = blackScholes(screen.price, strike, Math.round((expirationDate.getTime() - Date.now()) / 86_400_000), iv, optionType);
    while (modeled.price > MAX_CONTRACT_PREMIUM && otmPercent < MAX_MODELED_OTM_PERCENT) {
      otmPercent += 0.02;
      strike = pickStrike(screen.price, c.screen.direction, otmPercent);
      const dteNow = Math.round((expirationDate.getTime() - Date.now()) / 86_400_000);
      modeled = blackScholes(screen.price, strike, dteNow, iv, optionType);
    }
    if (modeled.price > MAX_CONTRACT_PREMIUM) {
      logger.info(
        { symbol: c.symbol, modeledPremium: modeled.price.toFixed(2) },
        "Skipped stock options signal — no real chain available and the modeled contract couldn't be brought under the premium cap",
      );
      return null;
    }
    premiumOverride = modeled.price;
  }

  const dte = Math.max(Math.round((expirationDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)), 1);
  const finalStyle: SignalStyle = dte < SWING_LEAP_THRESHOLD_DAYS ? "Swing" : "LEAPS";
  const isLongHorizon = finalStyle === "LEAPS";

  return buildOptionSignalRecord({
    c,
    newsAlert,
    confluence,
    fomcInWindow,
    optionType,
    strike,
    expirationDate,
    dte,
    iv,
    premium: premiumOverride!,
    realQuote,
    style: finalStyle,
    isLongHorizon,
  });
}

function buildOptionSignalRecord(args: {
  c: Candidate;
  newsAlert: { flagged: boolean; note: string | null };
  confluence: MacroConfluence;
  fomcInWindow: boolean;
  optionType: "Call" | "Put";
  strike: number;
  expirationDate: Date;
  dte: number;
  iv: number;
  premium: number;
  realQuote: ChainContract | null;
  style: SignalStyle;
  isLongHorizon: boolean;
}) {
  const { c, newsAlert, confluence, fomcInWindow, optionType, strike, expirationDate, dte, iv, premium, realQuote, style, isLongHorizon } = args;
  const { screen } = c;
  const isFallback = !screen.strictMatch;

  const entryGreeks = blackScholes(screen.price, strike, dte, iv, optionType);
  // Target: underlying reaches the opposite level (resistance for a call
  // setup, support for a put setup), option re-priced at that spot with a
  // few fewer days on the clock. Stop: underlying breaks back through the
  // level that defined the setup in the first place. A long-horizon
  // (LEAPS-classified) contract extrapolates the same near-term
  // support/resistance move out further (a multi-month thesis should be
  // sized on a bigger expected move than a short swing) and gives the
  // underlying more room before invalidating the thesis on the way there.
  const targetSpot = isLongHorizon
    ? c.screen.direction === "Long"
      ? screen.price + (screen.resistance - screen.price) * 3
      : screen.price - (screen.price - screen.support) * 3
    : c.screen.direction === "Long"
      ? screen.resistance
      : screen.support;
  const stopSpot = isLongHorizon
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

  const contractLabel = `${c.symbol} ${formatExpirationCode(expirationDate)} ${strike} ${optionType === "Call" ? "C" : "P"}`;

  const dataSourceNote = realQuote
    ? ` Strike/expiration/bid-ask/open interest/IV below are from a LIVE options chain quote — still verify current pricing before publishing, as quotes move.`
    : ` Premium and Greeks below are MODELED (Black-Scholes off ${(iv * 100).toFixed(0)}% realized volatility) — no live quote was available for this contract, so verify real bid/ask before publishing.`;

  return {
    id: randomUUID(),
    asset: c.symbol,
    sector: c.sector,
    market: "Stocks" as const,
    direction: c.screen.direction,
    status: "Watching" as const,
    entry: `$${premium.toFixed(2)}`,
    target: `$${targetGreeks.price.toFixed(2)}`,
    stop: `$${stopGreeks.price.toFixed(2)}`,
    timeframe: `${formatExpirationLabel(expirationDate)} expiry`,
    risk: "Medium",
    style,
    analysis:
      buildAnalysisText(c, isFallback, confluence, fomcInWindow) +
      dataSourceNote +
      ` ${style} contract (${dte} days to expiration, cap $${MAX_CONTRACT_PREMIUM.toFixed(2)}/share = $${(MAX_CONTRACT_PREMIUM * 100).toFixed(0)}/contract). ` +
      projection.text +
      (isLongHorizon
        ? ` Structured as a longer-dated position (${formatExpirationLabel(expirationDate)}, ~${dte} days out) to give the trend room to play out rather than timing a short-term bounce — size and expect price swings accordingly given the extended time horizon.`
        : ` Shorter-dated than this scan's ideal 6mo+ LEAPS target — that's what was actually available on the live chain for this ticker, so this is classified as a Swing options play instead.`) +
      (newsAlert.flagged ? ` ⚠ ${newsAlert.note}` : ""),
    isOption: true,
    optionType,
    contract: contractLabel,
    expiration: formatExpirationLabel(expirationDate),
    strike: `$${strike.toFixed(2)}`,
    premium: `$${premium.toFixed(2)}`,
    bid: realQuote && realQuote.bid > 0 ? `$${realQuote.bid.toFixed(2)}` : `$${Math.max(premium - 0.05, 0.01).toFixed(2)}`,
    ask: realQuote && realQuote.ask > 0 ? `$${realQuote.ask.toFixed(2)}` : `$${(premium + 0.05).toFixed(2)}`,
    impliedVolatility: `${(iv * 100).toFixed(1)}%`,
    delta: Number(entryGreeks.delta.toFixed(3)),
    gamma: Number(entryGreeks.gamma.toFixed(4)),
    theta: Number(entryGreeks.theta.toFixed(3)),
    vega: Number(entryGreeks.vega.toFixed(3)),
    openInterest: realQuote && realQuote.openInterest > 0 ? String(realQuote.openInterest) : null,
    source: "auto" as const,
    newsAlert: newsAlert.flagged,
    newsAlertNote: newsAlert.note,
  };
}

/**
 * Day-trade futures signal — CME index/metals futures (MES/MNQ/ES/NQ/MGC),
 * not stocks and not an options contract. Built from 4-hour bars (resampled
 * from Yahoo's hourly futures data — see intradayData.ts's
 * resampleTo4Hour), matching the "1hr to 4hr timeframe" spec: 4H is the
 * structure/bias timeframe here, with the underlying 1H data giving it
 * enough resolution to actually resolve a same-week break-retest-engulfing
 * sequence rather than a multi-month one.
 *
 * Stop is the break-of-structure level from screen.breakoutRetest when
 * present ("risk the break of structure" — the whole point of that
 * confluence), falling back to the plain support/resistance buffer used
 * elsewhere in this file when it isn't. Target is the opposing
 * support/resistance level. Returns null — deliberately not a signal with
 * a worse ratio, and deliberately not a signal with an artificially
 * stretched target that ignores real structure — when the resulting
 * reward:risk doesn't clear MIN_RISK_REWARD (1:3).
 *
 * There's no options-chain modeling here at all (no strike/premium/Greeks
 * — see schema doc on isOption), no earnings/news-alert lookup either
 * (getNewsAlert is calendar-driven for equities; not meaningful for an
 * index/metals future), though the FOMC-window check from the caller still
 * applies — a rate decision moves ES/NQ/MGC hard regardless of instrument type.
 *
 * KNOWN WORKAROUND: the `market` enum only has "Stocks"/"Crypto" today (no
 * "Futures" value) — adding one is a schema migration, and this app
 * currently has a separate pending migration blocked on an interactive
 * drizzle-kit prompt the user needs to resolve by hand. Rather than stack a
 * second migration on top of that, futures signals are stored with
 * market: "Stocks" and disambiguated via `sector` ("Index Futures"/"Metals
 * Futures") and this analysis text. Worth a proper "Futures" enum value as
 * a fast-follow once that pending migration is cleared.
 */
function buildFuturesDayTradeSignal(
  c: Candidate,
  confluence: MacroConfluence,
  fomcInWindow: boolean,
): { record: ReturnType<typeof buildFuturesDayTradeRecord>; riskReward: number } | null {
  const { screen } = c;
  const stop = screen.breakoutRetest
    ? screen.direction === "Long"
      ? screen.breakoutRetest.brokenLevel * 0.997
      : screen.breakoutRetest.brokenLevel * 1.003
    : screen.direction === "Long"
      ? screen.support * 0.99
      : screen.resistance * 1.01;
  const target = screen.direction === "Long" ? screen.resistance : screen.support;

  const risk = Math.abs(screen.price - stop);
  const reward = Math.abs(target - screen.price);
  if (risk <= 0) return null;
  const riskReward = reward / risk;
  if (riskReward < MIN_RISK_REWARD) return null;

  return { record: buildFuturesDayTradeRecord(c, confluence, fomcInWindow, stop, target, riskReward), riskReward };
}

function buildFuturesDayTradeRecord(
  c: Candidate,
  confluence: MacroConfluence,
  fomcInWindow: boolean,
  stop: number,
  target: number,
  riskReward: number,
) {
  const { screen } = c;
  const isFallback = !screen.strictMatch;
  const structureNote = screen.breakoutRetest
    ? ` Break-of-structure retest confirmed: price broke ${screen.direction === "Long" ? "above" : "below"} $${screen.breakoutRetest.brokenLevel.toFixed(2)}, retested that level, and an engulfing candle confirmed it's holding — risk is placed on a close back through that level (break of structure invalidates the thesis), not just a generic support/resistance buffer.`
    : "";
  const vp = screen.volumeProfile;
  const volumeNote = vp
    ? ` Fixed-range volume profile (prior session's high to current price) puts the highest-volume node — the point of control — at $${vp.poc.toFixed(2)}; treat that as a secondary entry-zone reference alongside the current price.`
    : "";

  return {
    id: randomUUID(),
    asset: c.symbol,
    sector: c.sector,
    // See buildFuturesDayTradeSignal's doc comment — known workaround, no "Futures" market value yet.
    market: "Stocks" as const,
    direction: screen.direction,
    status: "Watching" as const,
    entry: `$${screen.price.toFixed(2)}`,
    target: `$${target.toFixed(2)}`,
    stop: `$${stop.toFixed(2)}`,
    timeframe: "4H structure (1H-built) — day session futures",
    risk: "High",
    style: "Day Trade" as const,
    analysis:
      buildAnalysisText(c, isFallback, confluence, fomcInWindow) +
      ` CME futures contract (${c.symbol}), not an equity or options play — quoted in index/metals points, not a per-share price. Built from 4-hour bars (resampled from hourly). ` +
      `Reward:risk on this setup is ~1:${riskReward.toFixed(1)} (entry $${screen.price.toFixed(2)}, target $${target.toFixed(2)}, stop $${stop.toFixed(2)}) — only surfaced because it clears the 1:${MIN_RISK_REWARD} minimum.` +
      structureNote +
      volumeNote,
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
    newsAlert: false,
    newsAlertNote: null,
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
    let leapsInserted = 0;
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
            : await buildStockOptionSignal(c, newsAlert, confluence, fomcInWindow)
          : buildCryptoSpotSignal(c, newsAlert, confluence, fomcInWindow, style === "LEAPS" ? "Swing" : style);

      // buildStockOptionSignal can come back null when no real chain
      // contract (and no modeled fallback) clears MAX_CONTRACT_PREMIUM —
      // skip this candidate rather than publish an unaffordable contract or
      // crash the insert on a null record.
      if (!record) {
        logger.info({ symbol: c.symbol }, "Skipped auto signal insert — no affordable options contract available for this candidate");
        continue;
      }

      try {
        await db.insert(signalsTable).values(record as never);
        inserted.push(c.symbol);
        // Use the record's own (possibly real-chain-driven) style rather
        // than the pre-computed `style` var — see buildStockOptionSignal's
        // doc comment on why the final Swing/LEAPS classification can
        // differ from what was targeted.
        if (record.style === "LEAPS") leapsInserted++;
      } catch (err) {
        logger.error({ err, symbol: c.symbol }, "Failed to insert auto-generated signal");
      }
    }

    // LEAPS top-up: the ranked selection above picks the single best 1-2
    // setups across ALL styles, so a run can easily land zero or one LEAPS
    // signal even when the stock universe has multiple trend-aligned
    // candidates — pickStyle only produces "LEAPS" for stocks, and only the
    // top-ranked picks get chosen. Force it here rather than changing the
    // ranking itself, which would risk demoting a genuinely stronger Swing
    // setup just to make room for a weaker LEAPS one. Runs over the same
    // `ranked` stock pool, in order, skipping symbols already used above.
    if (leapsInserted < LEAPS_MIN_PER_RUN) {
      // Trend-aligned candidates first — a LEAPS thesis is a multi-month
      // hold, so a counter-trend setup (trendAligned: false) makes for a
      // meaningfully worse LEAPS candidate than it does a short-dated Swing
      // one. Only reach into counter-trend candidates if trend-aligned ones
      // genuinely run out; `ranked`'s existing strict-match-first order is
      // preserved within each group.
      const leapsPool = ranked
        .filter((c) => c.market === "Stocks" && !usedSymbols.has(c.symbol))
        .sort((a, b) => Number(b.screen.trendAligned === true) - Number(a.screen.trendAligned === true));
      for (const c of leapsPool) {
        if (leapsInserted >= LEAPS_MIN_PER_RUN) break;
        if (await hasRecentAutoSignal(c.symbol)) continue;
        usedSymbols.add(c.symbol);
        const windowEnd = new Date();
        windowEnd.setUTCDate(windowEnd.getUTCDate() + 14);
        const newsAlert = await getNewsAlert(c.symbol, c.market, new Date(), windowEnd);
        const fomcInWindow = fomcInWindowFor(c.market);
        const record = await buildStockOptionSignal(c, newsAlert, confluence, fomcInWindow);
        if (!record) {
          logger.info({ symbol: c.symbol }, "Skipped LEAPS top-up insert — no affordable options contract available for this candidate");
          continue;
        }
        try {
          await db.insert(signalsTable).values(record as never);
          inserted.push(c.symbol);
          // Only counts toward the LEAPS quota if the real chain actually
          // landed on a 6mo+ expiration — see buildStockOptionSignal's doc
          // comment. A Swing-classified result here still gets published
          // (a real, affordable, trend-aligned setup is still worth
          // publishing), it just doesn't satisfy this top-up pass, so the
          // loop keeps trying further candidates.
          if (record.style === "LEAPS") leapsInserted++;
        } catch (err) {
          logger.error({ err, symbol: c.symbol }, "Failed to insert LEAPS top-up signal");
        }
      }
      if (leapsInserted < LEAPS_MIN_PER_RUN) {
        logger.warn(
          { leapsInserted, target: LEAPS_MIN_PER_RUN },
          "Could not reach the LEAPS-per-run minimum — stock universe/dedup left too few eligible candidates this run",
        );
      }
    }

    logger.info({ inserted, leapsInserted, scanned: allCandidates.length }, "Auto signal scan complete");
  } catch (err) {
    logger.error({ err }, "Auto signal scan failed");
  }
}

// Caps how many day-trade candidates a single run inserts (DAY_TRADE_MAX_PER_RUN),
// mirroring MAX_SIGNALS_PER_RUN's role for the swing/LEAPS scan above.
// Unlike that scan, there's deliberately no floor — see DAY_TRADE_MAX_PER_RUN's
// doc comment for why a quiet day (nothing clears both the technical screen
// AND the 1:3 reward:risk bar) is a correct, expected outcome here, not a
// failure to paper over.
export async function runDayTradeScan(): Promise<void> {
  logger.info("Futures day-trade scan starting");
  try {
    const results = await batchScreen(
      DAY_TRADE_UNIVERSE,
      async (item) => resampleTo4Hour(await fetchFuturesHourlyBars(item.yahooSymbol)),
      (item) => item.asset,
    );
    const sectorBySymbol = new Map(DAY_TRADE_UNIVERSE.map((c) => [c.asset, c.sector]));

    if (results.length === 0) {
      logger.warn("Day-trade scan found zero usable candidates (futures data fetch failed for the whole universe) — no signals created this run");
      return;
    }

    const confluence = await getMacroConfluence();
    const now = new Date();
    const windowEnd = new Date(now);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);
    const fomcInWindow = fomcWithinRange(now, windowEnd);

    const recentAssets = await getRecentAutoDayTradeAssets();
    const pool = results.filter((r) => !recentAssets.has(r.symbol));

    // Same strict-first ranking approach as the swing/LEAPS scan: prefer
    // setups that fully clear the technical thresholds, fall back to the
    // best available read otherwise.
    const rankScore = (r: { screen: ScreenResult }) => r.screen.score;
    const strict = pool.filter((r) => r.screen.strictMatch).sort((a, b) => rankScore(b) - rankScore(a));
    const rest = pool.filter((r) => !r.screen.strictMatch).sort((a, b) => rankScore(b) - rankScore(a));
    const ranked = [...strict, ...rest];

    const inserted: string[] = [];
    let skippedOnRiskReward = 0;
    // Built alongside `inserted` (rather than re-queried by asset symbol
    // afterward) so the digest email below reflects exactly this run's rows
    // — an asset-symbol re-query could also pick up an older Active/Watching
    // day-trade signal on the same ticker from a previous run.
    const insertedRows: Array<{
      asset: string; market: string; sector: string | null; direction: string; style: string;
      status: string; isOption: boolean; contract: string | null; entry: string; target: string;
    }> = [];
    // Walk the FULL ranked pool, not just the top DAY_TRADE_MAX_PER_RUN —
    // buildFuturesDayTradeSignal can reject a candidate for not clearing
    // the reward:risk bar, so the top-ranked-by-technicals candidate isn't
    // necessarily one that ends up publishable.
    for (const r of ranked) {
      if (inserted.length >= DAY_TRADE_MAX_PER_RUN) break;
      if (await hasRecentAutoDayTradeSignal(r.symbol)) {
        logger.info({ symbol: r.symbol }, "Skipped day-trade insert — a recent Watching/Active day-trade signal already exists for this asset");
        continue;
      }
      const candidate: Candidate = { symbol: r.symbol, market: "Stocks", screen: r.screen, sector: sectorBySymbol.get(r.symbol) ?? null };
      const built = buildFuturesDayTradeSignal(candidate, confluence, fomcInWindow);
      if (!built) {
        skippedOnRiskReward++;
        continue;
      }
      try {
        await db.insert(signalsTable).values(built.record as never);
        inserted.push(r.symbol);
        insertedRows.push({
          asset: built.record.asset, market: built.record.market, sector: built.record.sector, direction: built.record.direction,
          style: built.record.style, status: built.record.status, isOption: built.record.isOption, contract: built.record.contract,
          entry: built.record.entry, target: built.record.target,
        });
      } catch (err) {
        logger.error({ err, symbol: r.symbol }, "Failed to insert day-trade signal");
      }
    }

    logger.info(
      { inserted, skippedOnRiskReward, scanned: results.length },
      inserted.length === 0
        ? "Futures day-trade scan complete — no candidate cleared the RSI screen + 1:3 reward:risk bar today"
        : "Futures day-trade scan complete",
    );

    // Best-effort recap to the ops inbox, fired right off this run's own
    // results rather than a separately-scheduled re-query — see
    // emailDigestScheduler.ts for the weekly digest, which does need its own
    // wall-clock-aligned schedule since it's not tied to any single scan.
    try {
      await sendDailyDayTradeDigest(insertedRows);
    } catch (err) {
      logger.error({ err }, "Daily day-trade digest send failed (signals were still saved)");
    }
  } catch (err) {
    logger.error({ err }, "Futures day-trade scan failed");
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

const DAY_TRADE_RUN_INTERVAL_MS = 24 * 60 * 60 * 1000; // every day
let dayTradeSchedulerStarted = false;

/**
 * Separate timer from startSignalScanScheduler above — day trades need a
 * daily cadence, distinct from the swing/LEAPS scan's 2-day one. Staggered
 * 40s after boot (vs. 20s for the other scan) purely so the two initial
 * runs don't hit the same external data hosts (Nasdaq/CoinGecko/Yahoo) in
 * the same instant on cold start.
 *
 * Caveat worth knowing: like startSignalScanScheduler, this is a plain
 * in-process setInterval, not a wall-clock cron — the "every 24h" clock
 * resets on every deploy/restart, so the actual time-of-day this fires can
 * drift across redeploys. Good enough for "at least once a day," not a
 * guarantee of a fixed time.
 */
export function startDayTradeScanScheduler(): void {
  if (dayTradeSchedulerStarted) return;
  dayTradeSchedulerStarted = true;

  setTimeout(() => {
    void runDayTradeScan();
  }, 40_000);
  setInterval(() => {
    void runDayTradeScan();
  }, DAY_TRADE_RUN_INTERVAL_MS);
}

startSignalScanScheduler();
startDayTradeScanScheduler();
