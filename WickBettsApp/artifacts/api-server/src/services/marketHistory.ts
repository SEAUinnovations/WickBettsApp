import { logger } from "../lib/logger.js";
import type { DailyBar } from "./technicalAnalysis.js";
import { NASDAQ_HEADERS } from "./httpHeaders.js";

function parseMoney(s: string | undefined | null): number {
  if (!s) return 0;
  return parseFloat(String(s).replace(/[$,%+\s]/g, "")) || 0;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Daily OHLCV for a US equity from Nasdaq's historical-data API (the same
 * `api.nasdaq.com` host the live quote board already fetches from
 * successfully in production, so it's a trusted-reachable domain — the
 * historical sub-endpoint's exact response shape is parsed defensively
 * since it hasn't been exercised in this codebase before).
 */
export async function fetchStockDailyBars(symbol: string, days = 90): Promise<DailyBar[]> {
  try {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/historical?assetclass=stocks&fromdate=${toISODate(from)}&todate=${toISODate(to)}&limit=${days}`;
    const res = await fetch(url, { headers: NASDAQ_HEADERS, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as {
      data?: { tradesTable?: { rows?: Array<Record<string, string>> } };
    };
    const rows = json?.data?.tradesTable?.rows ?? [];
    const bars: DailyBar[] = rows
      .map((r) => {
        const close = parseMoney(r.close);
        const open = parseMoney(r.open) || close;
        const high = parseMoney(r.high) || Math.max(open, close);
        const low = parseMoney(r.low) || Math.min(open, close);
        const volume = parseMoney(r.volume);
        const date = (r.date ?? "").trim();
        return { date, open, high, low, close, volume } satisfies DailyBar;
      })
      .filter((b) => b.close > 0 && b.date);

    // Nasdaq returns most-recent-first; our indicators expect chronological order.
    bars.reverse();
    return bars;
  } catch (err) {
    logger.debug({ err, symbol }, "Stock historical bars fetch failed");
    return [];
  }
}

/**
 * Daily closes for a crypto asset from CoinGecko (the same host the live
 * quote board already uses). CoinGecko's market_chart endpoint returns price
 * points, not true OHLC — high/low/open are set equal to close per bar as a
 * documented simplification; support/resistance ends up being a rolling
 * min/max of daily closes rather than intraday wicks, which is a reasonable
 * proxy given the data available.
 */
export async function fetchCryptoDailyBars(coingeckoId: string, days = 90): Promise<DailyBar[]> {
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as {
      prices?: Array<[number, number]>;
      total_volumes?: Array<[number, number]>;
    };
    const points = json?.prices ?? [];
    const volumes = json?.total_volumes ?? [];
    return points
      .map(([ts, price], i) => {
        const date = toISODate(new Date(ts));
        const volume = volumes[i]?.[1] ?? 0;
        return { date, open: price, high: price, low: price, close: price, volume } satisfies DailyBar;
      })
      .filter((b) => b.close > 0);
  } catch (err) {
    logger.debug({ err, coingeckoId }, "Crypto historical bars fetch failed");
    return [];
  }
}
