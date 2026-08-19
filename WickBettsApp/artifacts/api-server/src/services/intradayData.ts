import { logger } from "../lib/logger.js";
import type { DailyBar } from "./technicalAnalysis.js";
import { YAHOO_HEADERS } from "./httpHeaders.js";

/**
 * Intraday/sub-daily OHLCV bars, used exclusively by the day-trade scan
 * (see signalScanner.ts's runDayTradeScan). Everywhere else in this app
 * ("Swing"/"LEAPS"/"Buy & Hold") intentionally works off daily bars — see
 * the note on marketHistory.ts. Day trades are the one style that actually
 * needs sub-daily resolution to mean anything, so this hits a different
 * data source: Yahoo Finance's public (undocumented, no API key) chart
 * endpoint, which is the only free source of real sub-daily bars available
 * without adding a paid market-data subscription (Nasdaq's public API, used
 * everywhere else in this app, does not expose historical intraday bars —
 * only a single latest-quote snapshot). This same endpoint also serves
 * continuous futures contracts (symbol + "=F", e.g. "ES=F", "MES=F") —
 * used by fetchFuturesHourlyBars below.
 */

interface YahooChartResult {
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      open?: (number | null)[];
      high?: (number | null)[];
      low?: (number | null)[];
      close?: (number | null)[];
      volume?: (number | null)[];
    }>;
  };
}

async function fetchYahooBars(symbol: string, interval: string, range: string): Promise<DailyBar[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
    const res = await fetch(url, { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { chart?: { result?: YahooChartResult[]; error?: unknown } };
    if (json?.chart?.error) throw new Error(JSON.stringify(json.chart.error));
    const result = json?.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const quote = result?.indicators?.quote?.[0];
    if (!quote || timestamps.length === 0) return [];

    const bars: DailyBar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = quote.close?.[i];
      const open = quote.open?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      const volume = quote.volume?.[i];
      // Yahoo returns null for bars still forming (the current in-progress
      // interval) or for gaps around halts/thin pre/post windows — skip
      // rather than coercing to 0, which would corrupt RSI/volume math.
      if (close == null || open == null || high == null || low == null) continue;
      bars.push({
        date: new Date(timestamps[i] * 1000).toISOString(),
        open,
        high,
        low,
        close,
        volume: volume ?? 0,
      });
    }
    return bars;
  } catch (err) {
    logger.debug({ err, symbol, interval, range }, "Yahoo intraday bars fetch failed");
    return [];
  }
}

/**
 * 15-minute stock/ETF bars over 5 days. Kept as a general-purpose helper —
 * not currently called by the day-trade scan (see fetchFuturesHourlyBars
 * below, which is what runDayTradeScan actually uses), but left available
 * for any future sub-daily equity screening.
 */
export async function fetchStockIntradayBars(symbol: string): Promise<DailyBar[]> {
  return fetchYahooBars(symbol, "15m", "5d");
}

/**
 * Hourly bars for a continuous futures contract (Yahoo's "=F" ticker
 * convention — e.g. "MES=F", "ES=F", "NQ=F", "MNQ=F", "MGC=F"). 10 days of
 * hourly bars is comfortably enough history for technicalAnalysis.ts's
 * RSI(14)/20-bar support-resistance/breakout-retest structure detection
 * (needs 33+ bars — see detectBreakoutRetestEngulfing) while staying
 * recent enough that the structure it's reading is this week's, not stale.
 */
export async function fetchFuturesHourlyBars(symbol: string): Promise<DailyBar[]> {
  return fetchYahooBars(symbol, "60m", "10d");
}

/**
 * Resamples 1-hour bars into 4-hour bars by grouping every 4 consecutive
 * input bars — used for the day-trade scan's higher-timeframe structure
 * read (see runDayTradeScan: "1hr to 4hr timeframe" per the trading spec).
 * Chronological grouping only (no session-boundary alignment — Yahoo's
 * hourly futures bars already span a near-24h session, so there's no
 * natural "4h candle" boundary to align to the way there would be for a
 * regular-hours-only equity).
 */
export function resampleTo4Hour(hourlyBars: DailyBar[]): DailyBar[] {
  const out: DailyBar[] = [];
  for (let i = 0; i < hourlyBars.length; i += 4) {
    const group = hourlyBars.slice(i, i + 4);
    if (group.length === 0) continue;
    out.push({
      date: group[0].date,
      open: group[0].open,
      high: Math.max(...group.map((b) => b.high)),
      low: Math.min(...group.map((b) => b.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((s, b) => s + b.volume, 0),
    });
  }
  return out;
}
