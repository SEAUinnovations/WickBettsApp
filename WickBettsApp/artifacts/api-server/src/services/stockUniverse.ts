import { logger } from "../lib/logger.js";
import { NASDAQ_HEADERS } from "./httpHeaders.js";

/**
 * Builds the candidate stock universe for the auto-signal scanner:
 *   - price > $90
 *   - NOT a member of the S&P 500 or the Nasdaq-100
 *   - ranked by volume so "most popular" (most actively traded) names outside
 *     those two mega-indices surface first
 *
 * Index membership drifts over time (additions/removals happen a few times a
 * year), so this always includes a hardcoded baseline of the most obvious
 * mega-caps as a safety net, then tries to augment it with the live
 * Wikipedia constituent tables. If that fetch/parse ever fails, the baseline
 * alone still keeps the filter meaningfully correct — it just won't catch
 * the newest/smallest index additions until the next successful refresh.
 */

// Safety-net baseline — update occasionally, but the live Wikipedia fetch
// below is the real source of truth when it succeeds.
const KNOWN_INDEX_BASELINE = new Set([
  "AAPL", "MSFT", "NVDA", "GOOGL", "GOOG", "AMZN", "META", "TSLA", "AVGO", "JPM",
  "V", "MA", "UNH", "HD", "PG", "JNJ", "COST", "ORCL", "NFLX", "ABBV",
  "BAC", "KO", "PEP", "CSCO", "TMO", "MRK", "ADBE", "CRM", "WMT", "DIS",
  "ACN", "LIN", "MCD", "ABT", "INTC", "QCOM", "TXN", "AMD", "INTU", "HON",
  "IBM", "AMGN", "PYPL", "CMCSA", "GS", "CAT", "BA", "SBUX", "GE", "NOW",
  "ISRG", "BKNG", "PLTR", "UBER", "PANW", "VRTX", "REGN", "ADP", "MDLZ", "GILD",
  "LRCX", "KLAC", "SNPS", "CDNS", "MU", "ADI", "PDD", "MELI", "ASML", "MRVL",
  "AMAT", "APP", "FTNT", "CRWD", "PYPL", "AXP", "SPGI", "BLK", "LMT", "SCHW",
  "T", "VZ", "CVX", "XOM", "WFC", "C", "MS", "COP", "NKE", "LOW",
]);

let indexAugmentCache: { tickers: Set<string>; fetchedAt: number } | null = null;
const INDEX_REFRESH_MS = 7 * 24 * 60 * 60 * 1000; // weekly

/** Pull ticker symbols out of a MediaWiki constituents table's first-column cells. */
function extractTickersFromWikitable(html: string): string[] {
  const tableMatch = html.match(/<table[^>]*(?:id="constituents"|class="[^"]*wikitable[^"]*")[\s\S]*?<\/table>/i);
  const tableHtml = tableMatch ? tableMatch[0] : html;
  const rowRe = /<tr[\s\S]*?<\/tr>/gi;
  const rows = tableHtml.match(rowRe) ?? [];
  const tickers: string[] = [];
  for (const row of rows) {
    const cellMatch = row.match(/<td[^>]*>([\s\S]*?)<\/td>/i);
    if (!cellMatch) continue;
    const text = cellMatch[1].replace(/<[^>]+>/g, "").trim();
    if (/^[A-Z]{1,6}(\.[A-Z])?$/.test(text)) tickers.push(text.replace(".", "-"));
  }
  return tickers;
}

async function fetchWikiConstituents(url: string): Promise<string[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "WickBettsSignalScanner/1.0 (contact: ops@wickbetts.com)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return extractTickersFromWikitable(html);
}

async function refreshIndexMembership(): Promise<Set<string>> {
  try {
    const [sp500, ndx100] = await Promise.all([
      fetchWikiConstituents("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"),
      fetchWikiConstituents("https://en.wikipedia.org/wiki/Nasdaq-100"),
    ]);
    const combined = new Set([...sp500, ...ndx100]);
    // Sanity floor — the real lists are ~500 and ~100 names; if parsing broke
    // (Wikipedia changed markup) we'd get a tiny/garbage set. Don't trust it.
    if (combined.size < 300) {
      throw new Error(`Parsed suspiciously few tickers (${combined.size}) — likely a markup change`);
    }
    logger.info({ count: combined.size }, "Refreshed S&P 500 / Nasdaq-100 exclusion list from Wikipedia");
    return combined;
  } catch (err) {
    logger.warn({ err }, "Could not refresh index membership from Wikipedia — using baseline exclusion list only");
    return new Set();
  }
}

async function getIndexExclusionSet(): Promise<Set<string>> {
  if (indexAugmentCache && Date.now() - indexAugmentCache.fetchedAt < INDEX_REFRESH_MS) {
    return indexAugmentCache.tickers;
  }
  const augmented = await refreshIndexMembership();
  indexAugmentCache = { tickers: augmented, fetchedAt: Date.now() };
  return augmented;
}

export async function isIndexMember(symbol: string): Promise<boolean> {
  if (KNOWN_INDEX_BASELINE.has(symbol)) return true;
  const augmented = await getIndexExclusionSet();
  return augmented.has(symbol);
}

export interface ScreenerRow {
  symbol: string;
  price: number;
  volume: number;
}

function parseMoney(s: string | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(/[$,%+\s]/g, "")) || 0;
}

async function fetchExchangeScreener(exchange: "NASDAQ" | "NYSE"): Promise<ScreenerRow[]> {
  try {
    const url = `https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=300&exchange=${exchange}`;
    const res = await fetch(url, { headers: NASDAQ_HEADERS, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as {
      data?: { table?: { rows?: Array<Record<string, string>> } };
    };
    const rows = json?.data?.table?.rows ?? [];
    return rows
      .map((r) => ({
        symbol: (r.symbol ?? "").trim().toUpperCase(),
        price: parseMoney(r.lastsale),
        volume: parseMoney(r.volume),
      }))
      .filter((r) => r.symbol && r.price > 0);
  } catch (err) {
    logger.warn({ err, exchange }, "Exchange screener fetch failed");
    return [];
  }
}

/**
 * Builds the ranked candidate list: price > $90, not in S&P 500 / Nasdaq-100,
 * sorted by volume descending, capped to `limit`.
 */
export async function buildStockCandidateList(limit = 60): Promise<string[]> {
  const [nasdaqRows, nyseRows] = await Promise.all([
    fetchExchangeScreener("NASDAQ"),
    fetchExchangeScreener("NYSE"),
  ]);
  const allRows = [...nasdaqRows, ...nyseRows].filter((r) => r.price > 90);

  if (allRows.length === 0) {
    logger.warn("Stock screener returned no rows from either exchange — scan will have no stock candidates this run");
    return [];
  }

  const exclusion = await getIndexExclusionSet();
  const filtered = allRows.filter(
    (r) => !KNOWN_INDEX_BASELINE.has(r.symbol) && !exclusion.has(r.symbol),
  );

  filtered.sort((a, b) => b.volume - a.volume);

  // De-dupe (a symbol could theoretically show up on both exchange calls)
  const seen = new Set<string>();
  const ranked: string[] = [];
  for (const row of filtered) {
    if (seen.has(row.symbol)) continue;
    seen.add(row.symbol);
    ranked.push(row.symbol);
    if (ranked.length >= limit) break;
  }
  return ranked;
}
