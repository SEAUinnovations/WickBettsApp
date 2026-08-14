import { logger } from "../lib/logger.js";
import { NASDAQ_HEADERS } from "./httpHeaders.js";

/**
 * "Big news day" awareness for the auto-signal scanner's star flag: does this
 * trade's window (today through expiration, or a fixed holding window for
 * spot trades) cross a major macro event that could whipsaw the setup?
 *
 * Two tiers:
 *   1. Macro events (FOMC / CPI / jobs report) — same for every symbol.
 *   2. That specific company's next earnings date — fetched best-effort from
 *      Nasdaq's calendar API; failure here is silently non-fatal, it just
 *      means the star only reflects macro events for that symbol.
 */

// FOMC rate-decision days (the second day of each two-day meeting, when the
// statement and press conference happen) — confirmed via federalreserve.gov.
// Update this list at the start of each year.
const FOMC_2026: string[] = [
  "2026-01-28",
  "2026-03-18",
  "2026-04-29",
  "2026-06-17",
  "2026-07-29",
  "2026-09-16",
  "2026-10-28",
  "2026-12-09",
];

function firstFridayOfMonth(year: number, monthIndex0: number): Date {
  const d = new Date(Date.UTC(year, monthIndex0, 1));
  const dayOfWeek = d.getUTCDay();
  const offset = (5 - dayOfWeek + 7) % 7;
  d.setUTCDate(1 + offset);
  return d;
}

/** Nonfarm payrolls (jobs report) is deterministically the first Friday of each month. */
function nfpDatesForRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor <= end) {
    const nfp = firstFridayOfMonth(cursor.getUTCFullYear(), cursor.getUTCMonth());
    if (nfp >= start && nfp <= end) dates.push(nfp);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return dates;
}

/**
 * CPI release dates aren't on a fixed weekday like NFP — BLS publishes an
 * exact annual schedule, but absent a reliable fetchable source, this
 * approximates "around the 12th of the month" (BLS's historical pattern).
 * This is intentionally a rough heuristic, not the authoritative date.
 */
function approximateCpiDatesForRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 12));
  while (cursor <= end) {
    if (cursor >= start) dates.push(new Date(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return dates;
}

function fomcDatesForRange(start: Date, end: Date): Date[] {
  return FOMC_2026.map((iso) => new Date(`${iso}T00:00:00Z`)).filter((d) => d >= start && d <= end);
}

interface EarningsLookupResult {
  date: Date | null;
}

const earningsCache = new Map<string, { result: EarningsLookupResult; fetchedAt: number }>();
const EARNINGS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Best-effort next-earnings-date lookup. Returns null on any failure. */
async function fetchNextEarningsDate(symbol: string): Promise<Date | null> {
  const cached = earningsCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < EARNINGS_CACHE_TTL_MS) {
    return cached.result.date;
  }
  try {
    const url = `https://api.nasdaq.com/api/company/${encodeURIComponent(symbol)}/earnings-forecast`;
    const res = await fetch(url, { headers: NASDAQ_HEADERS, signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as {
      data?: { earningsForecastValues?: unknown; earningsDate?: { nextReportDate?: string } };
    };
    const raw = json?.data?.earningsDate?.nextReportDate;
    const date = raw ? new Date(raw) : null;
    const result: EarningsLookupResult = { date: date && !isNaN(date.getTime()) ? date : null };
    earningsCache.set(symbol, { result, fetchedAt: Date.now() });
    return result.date;
  } catch (err) {
    logger.debug({ err, symbol }, "Earnings date lookup failed — proceeding without it");
    earningsCache.set(symbol, { result: { date: null }, fetchedAt: Date.now() });
    return null;
  }
}

export interface NewsAlertResult {
  flagged: boolean;
  note: string | null;
}

/**
 * Checks whether any major macro event or (for stocks) the symbol's own
 * earnings date falls within [start, end] — the trade's expected holding
 * window. Used to set the "keep in mind" star on auto-generated signals.
 */
export async function getNewsAlert(
  symbol: string,
  market: "Stocks" | "Crypto",
  start: Date,
  end: Date,
): Promise<NewsAlertResult> {
  const events: string[] = [];

  for (const d of fomcDatesForRange(start, end)) {
    events.push(`FOMC rate decision ${formatShort(d)}`);
  }
  // Macro data releases move rates/yields, which spill into crypto too, but
  // matter most for equities — only surface CPI/NFP noise for stock signals.
  if (market === "Stocks") {
    for (const d of nfpDatesForRange(start, end)) {
      events.push(`Jobs report ${formatShort(d)}`);
    }
    for (const d of approximateCpiDatesForRange(start, end)) {
      events.push(`CPI release (approx.) ${formatShort(d)}`);
    }
    const earningsDate = await fetchNextEarningsDate(symbol);
    if (earningsDate && earningsDate >= start && earningsDate <= end) {
      events.push(`${symbol} earnings ${formatShort(earningsDate)}`);
    }
  }

  if (events.length === 0) return { flagged: false, note: null };
  return { flagged: true, note: `Falls near: ${events.join(", ")}` };
}

function formatShort(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
