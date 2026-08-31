/**
 * Real options-chain lookup — Yahoo Finance's unofficial (but widely relied
 * on, including by this app's own futures day-trade scan — see
 * intradayData.ts's fetchFuturesHourlyBars) options endpoint:
 *   https://query1.finance.yahoo.com/v7/finance/options/{symbol}[?date={unixSeconds}]
 * No API key required. Same "best-effort, degrade to null on any failure"
 * contract as every other external data source in this app (Nasdaq,
 * CoinGecko, Wikipedia, Yahoo futures bars) — a bad fetch, a non-optionable
 * symbol, or an unexpected response shape just means "no real chain this
 * time," never a thrown error that could take down a scan.
 *
 * Used by signalScanner.ts to replace/augment the modeled Black-Scholes
 * contract (optionsModel.ts) with real bid/ask/open interest/implied
 * volatility whenever a real quote is available, and to enforce a max
 * per-share premium so the scanner never calls out a contract more
 * expensive than a member can reasonably size into.
 */

interface RawContract {
  contractSymbol?: string;
  strike?: number;
  bid?: number;
  ask?: number;
  lastPrice?: number;
  openInterest?: number;
  impliedVolatility?: number;
  volume?: number;
  expiration?: number; // unix seconds
}

interface RawChainResult {
  underlyingSymbol?: string;
  expirationDates?: number[];
  quote?: { regularMarketPrice?: number };
  options?: Array<{ expirationDate?: number; calls?: RawContract[]; puts?: RawContract[] }>;
}

export interface ChainContract {
  contractSymbol: string;
  strike: number;
  bid: number;
  ask: number;
  lastPrice: number;
  openInterest: number;
  impliedVolatility: number;
  volume: number;
  expirationDate: Date;
  daysToExpiration: number;
}

export interface OptionsChainResult {
  underlyingPrice: number;
  expirationDates: Date[];
  calls: ChainContract[];
  puts: ChainContract[];
}

async function fetchRaw(symbol: string, dateParam?: number): Promise<RawChainResult | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}${
      dateParam ? `?date=${dateParam}` : ""
    }`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WickBettsSignalScanner/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { optionChain?: { result?: RawChainResult[] } };
    return json?.optionChain?.result?.[0] ?? null;
  } catch {
    return null;
  }
}

function mapContract(c: RawContract): ChainContract | null {
  if (typeof c.strike !== "number" || typeof c.expiration !== "number" || !c.contractSymbol) return null;
  const expirationDate = new Date(c.expiration * 1000);
  return {
    contractSymbol: c.contractSymbol,
    strike: c.strike,
    bid: c.bid ?? 0,
    ask: c.ask ?? 0,
    lastPrice: c.lastPrice ?? 0,
    openInterest: c.openInterest ?? 0,
    impliedVolatility: c.impliedVolatility ?? 0,
    volume: c.volume ?? 0,
    expirationDate,
    daysToExpiration: Math.round((expirationDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
  };
}

/**
 * Fetches the chain closest to a target DTE window. The first call (no
 * `date` param) is cheap and returns every available expiration date plus
 * the nearest chain; when the nearest chain isn't the one we actually want,
 * a second call re-fetches with the chosen expiration's timestamp so its
 * per-contract bid/ask/OI/IV are for that date specifically.
 */
export async function fetchOptionsChain(
  symbol: string,
  targetMinDays: number,
  targetMaxDays: number,
): Promise<OptionsChainResult | null> {
  const first = await fetchRaw(symbol);
  if (!first || !Array.isArray(first.expirationDates) || first.expirationDates.length === 0) return null;
  if (typeof first.quote?.regularMarketPrice !== "number") return null;

  const now = Date.now();
  const withDte = first.expirationDates.map((sec) => ({
    sec,
    dte: Math.round((sec * 1000 - now) / (24 * 60 * 60 * 1000)),
  }));

  // Prefer an expiration inside the requested window; real chains don't
  // always have one exactly there (monthly/quarterly spacing beyond a few
  // months out), so fall back to whichever is closest to the window's
  // midpoint rather than giving up.
  const inWindow = withDte.filter((d) => d.dte >= targetMinDays && d.dte <= targetMaxDays);
  const targetMid = (targetMinDays + targetMaxDays) / 2;
  const pool = inWindow.length > 0 ? inWindow : withDte;
  const chosen = pool.sort((a, b) => Math.abs(a.dte - targetMid) - Math.abs(b.dte - targetMid))[0];
  if (!chosen) return null;

  // Reuse the first response if it already happens to be for the chosen
  // expiration (avoids a redundant second fetch on the common case where
  // the nearest chain IS the one we want).
  const nearestIsChosen = first.options?.[0]?.expirationDate === chosen.sec;
  const raw = nearestIsChosen ? first : await fetchRaw(symbol, chosen.sec);
  if (!raw || !Array.isArray(raw.options) || raw.options.length === 0) return null;

  const chain = raw.options[0];
  const calls = (chain.calls ?? []).map(mapContract).filter((c): c is ChainContract => c !== null);
  const puts = (chain.puts ?? []).map(mapContract).filter((c): c is ChainContract => c !== null);
  if (calls.length === 0 && puts.length === 0) return null;

  return {
    underlyingPrice: first.quote.regularMarketPrice,
    expirationDates: first.expirationDates.map((sec) => new Date(sec * 1000)),
    calls,
    puts,
  };
}

/** Best real quote for a contract: mid of a two-sided bid/ask, else the last trade. */
export function contractMidPrice(c: ChainContract): number {
  if (c.bid > 0 && c.ask > 0) return (c.bid + c.ask) / 2;
  return c.lastPrice;
}

/**
 * Picks the best real contract for a direction, near a target strike,
 * capped at maxPremium per share (so e.g. maxPremium=20 keeps the contract
 * at or under $2,000 notional at the standard 100-share multiplier).
 * Contracts with no usable quote (mid price of 0 — an illiquid strike with
 * neither a two-sided quote nor a recent trade) are excluded outright; a
 * real-but-stale quote is still preferred over no real data at all.
 */
export function selectContract(
  chain: OptionsChainResult,
  optionType: "Call" | "Put",
  targetStrike: number,
  maxPremium: number,
): ChainContract | null {
  const pool = optionType === "Call" ? chain.calls : chain.puts;
  const affordable = pool.filter((c) => {
    const mid = contractMidPrice(c);
    return mid > 0 && mid <= maxPremium;
  });
  if (affordable.length === 0) return null;
  return affordable.sort((a, b) => Math.abs(a.strike - targetStrike) - Math.abs(b.strike - targetStrike))[0];
}
