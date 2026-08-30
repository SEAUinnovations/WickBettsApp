import { Router } from "express";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireActiveSubscription } from "./signals.js";

const router = Router();

// ── Ticker universe ───────────────────────────────────────────────────────────
type AssetClass = "etf" | "stocks";
// `domain` is only set for tickers that are a single real company — that's
// what makes a domain-based logo (see resolveLogoUrl below) meaningful. ETFs
// and macro instruments deliberately have no domain: a sector SPDR's "logo"
// would just be its issuer's (State Street's) logo repeated across a dozen
// unrelated tickers, which is worse than no icon at all — the UI falls back
// to an initials badge for those instead.
interface TickerMeta { assetclass: AssetClass; group: string; shortName: string; domain?: string }

const EQUITY_TICKERS: Record<string, TickerMeta> = {
  // Indices / broad ETFs
  SPY:  { assetclass: "etf",    group: "indices", shortName: "S&P 500 ETF" },
  QQQ:  { assetclass: "etf",    group: "indices", shortName: "Nasdaq 100 ETF" },
  IWM:  { assetclass: "etf",    group: "indices", shortName: "Russell 2000 ETF" },
  DIA:  { assetclass: "etf",    group: "indices", shortName: "Dow Jones ETF" },
  // Macro / bonds — VIXY and UUP are also the confluence inputs the auto
  // signal scanner reads for its cross-asset "decision factor" (see
  // services/macroConfluence.ts); tracked here too so members can see the
  // same instruments referenced in a signal's "Wick's Read".
  GLD:  { assetclass: "etf",    group: "macro",   shortName: "Gold" },
  TLT:  { assetclass: "etf",    group: "macro",   shortName: "20Y Treasury" },
  SLV:  { assetclass: "etf",    group: "macro",   shortName: "Silver" },
  USO:  { assetclass: "etf",    group: "macro",   shortName: "Oil" },
  VIXY: { assetclass: "etf",    group: "macro",   shortName: "VIX (volatility)" },
  UUP:  { assetclass: "etf",    group: "macro",   shortName: "US Dollar" },
  // Sectors
  XLK:  { assetclass: "etf",    group: "sectors", shortName: "Tech" },
  XLF:  { assetclass: "etf",    group: "sectors", shortName: "Financials" },
  XLV:  { assetclass: "etf",    group: "sectors", shortName: "Health" },
  XLE:  { assetclass: "etf",    group: "sectors", shortName: "Energy" },
  XLY:  { assetclass: "etf",    group: "sectors", shortName: "Cons. Disc." },
  XLI:  { assetclass: "etf",    group: "sectors", shortName: "Industrials" },
  XLRE: { assetclass: "etf",    group: "sectors", shortName: "Real Estate" },
  XLU:  { assetclass: "etf",    group: "sectors", shortName: "Utilities" },
  XLP:  { assetclass: "etf",    group: "sectors", shortName: "Staples" },
  XLC:  { assetclass: "etf",    group: "sectors", shortName: "Comms" },
  XLB:  { assetclass: "etf",    group: "sectors", shortName: "Materials" },
  // Mega-cap tech — grouped by real sector rather than a generic "mega-cap"
  // bucket, so the ticker search actually labels each one correctly.
  AAPL: { assetclass: "stocks", group: "technology", shortName: "Apple", domain: "apple.com" },
  MSFT: { assetclass: "stocks", group: "technology", shortName: "Microsoft", domain: "microsoft.com" },
  NVDA: { assetclass: "stocks", group: "technology", shortName: "Nvidia", domain: "nvidia.com" },
  ORCL: { assetclass: "stocks", group: "technology", shortName: "Oracle", domain: "oracle.com" },
  AMD:  { assetclass: "stocks", group: "technology", shortName: "AMD", domain: "amd.com" },
  AVGO: { assetclass: "stocks", group: "technology", shortName: "Broadcom", domain: "broadcom.com" },
  AMZN: { assetclass: "stocks", group: "consumer-discretionary", shortName: "Amazon", domain: "amazon.com" },
  TSLA: { assetclass: "stocks", group: "consumer-discretionary", shortName: "Tesla", domain: "tesla.com" },
  GOOGL:{ assetclass: "stocks", group: "communication-services", shortName: "Alphabet", domain: "google.com" },
  META: { assetclass: "stocks", group: "communication-services", shortName: "Meta", domain: "meta.com" },
  // Financials
  JPM:  { assetclass: "stocks", group: "financials", shortName: "JPMorgan", domain: "jpmorgan.com" },
  GS:   { assetclass: "stocks", group: "financials", shortName: "Goldman Sachs", domain: "goldmansachs.com" },
  V:    { assetclass: "stocks", group: "financials", shortName: "Visa", domain: "visa.com" },
  MA:   { assetclass: "stocks", group: "financials", shortName: "Mastercard", domain: "mastercard.com" },
  BAC:  { assetclass: "stocks", group: "financials", shortName: "BofA", domain: "bankofamerica.com" },
  MS:   { assetclass: "stocks", group: "financials", shortName: "Morgan Stanley", domain: "morganstanley.com" },
  // Crypto-adjacent stocks
  COIN: { assetclass: "stocks", group: "crypto",  shortName: "Coinbase", domain: "coinbase.com" },
  MSTR: { assetclass: "stocks", group: "crypto",  shortName: "MicroStrategy", domain: "microstrategy.com" },
};

const CRYPTO_TICKERS: Record<string, { id: string; shortName: string }> = {
  "BTC-USD": { id: "bitcoin",  shortName: "Bitcoin" },
  "ETH-USD": { id: "ethereum", shortName: "Ethereum" },
};

export function isTrackedSymbol(symbol: string): boolean {
  return Boolean(EQUITY_TICKERS[symbol] || CRYPTO_TICKERS[symbol]);
}

export interface QuoteItem {
  symbol: string; shortName: string; price: number; change: number;
  changePercent: number; volume: number; group: string; currency: string;
  /** Real logo image URL when one is known (see resolveLogoUrl below); null otherwise. */
  logoUrl: string | null;
}

interface CacheEntry { quotes: QuoteItem[]; fetchedAt: number }
let cache: CacheEntry | null = null;
const SCHEDULE_MS = 15 * 60 * 1000;
const CLIENT_POLL_MS = 15 * 60 * 1000;
const MARKET_TIMEZONE = "America/Chicago";
const MARKET_OPEN_MINUTES = 7 * 60;
const MARKET_CLOSE_MINUTES = 16 * 60;
let refreshPromise: Promise<CacheEntry> | null = null;
let schedulerStarted = false;
let lastScheduledSlot: string | null = null;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin": "https://www.nasdaq.com",
  "Referer": "https://www.nasdaq.com/",
};

function parseMoney(s: string): number {
  return parseFloat(s.replace(/[$,%+\s]/g, "")) || 0;
}

async function fetchNasdaqQuote(symbol: string, meta: TickerMeta): Promise<QuoteItem | null> {
  try {
    const url = `https://api.nasdaq.com/api/quote/${symbol}/info?assetclass=${meta.assetclass}`;
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json() as {
      data?: {
        primaryData?: {
          lastSalePrice?: string; netChange?: string; percentageChange?: string; volume?: string;
        };
      };
    };
    const d = json?.data?.primaryData;
    if (!d) return null;
    const price = parseMoney(d.lastSalePrice ?? "");
    if (!price) return null;
    const changePercent = parseMoney(d.percentageChange ?? "");
    const change = parseMoney(d.netChange ?? "");
    const volume = parseMoney(d.volume?.replace(/,/g, "") ?? "");
    const logoUrl = meta.domain ? `https://logo.clearbit.com/${meta.domain}` : null;
    return { symbol, shortName: meta.shortName, price, change, changePercent, volume, group: meta.group, currency: "USD", logoUrl };
  } catch {
    return null;
  }
}

async function fetchCryptoQuotes(): Promise<QuoteItem[]> {
  try {
    const ids = Object.values(CRYPTO_TICKERS).map((c) => c.id).join(",");
    // /coins/markets (rather than /simple/price, used previously) costs the
    // same one request but additionally returns each coin's official logo
    // image URL — straight from CoinGecko's own CDN, so it's guaranteed
    // accurate rather than a guessed asset id. Same host this app already
    // depends on for crypto price data (see services/marketHistory.ts).
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const json = (await res.json()) as Array<{
      id: string;
      current_price: number | null;
      price_change_percentage_24h: number | null;
      image?: string;
    }>;
    const byId = new Map(json.map((c) => [c.id, c]));
    return Object.entries(CRYPTO_TICKERS).map(([symbol, meta]) => {
      const data = byId.get(meta.id);
      if (!data) return null;
      const price = data.current_price ?? 0;
      const changePercent = data.price_change_percentage_24h ?? 0;
      const change = price * (changePercent / 100);
      return {
        symbol,
        shortName: meta.shortName,
        price,
        change,
        changePercent,
        volume: 0,
        group: "crypto",
        currency: "USD",
        logoUrl: data.image ?? null,
      } satisfies QuoteItem;
    }).filter((q): q is QuoteItem => q !== null);
  } catch {
    return [];
  }
}

/**
 * Best-effort logo image URL for a ticker symbol — used by Signals and
 * Community Shared Signals so a signal card can show the real company/coin
 * icon instead of just initials. Checks the live quote cache first (covers
 * every stock, ETF, and crypto symbol this app tracks; crypto logos there
 * come straight from CoinGecko, see fetchCryptoQuotes above), then falls
 * back to the static domain map directly for a tracked stock in case the
 * cache hasn't warmed up yet. A ticker outside the tracked universe — an
 * ETF with no single company behind it, or a symbol a member typed into a
 * community-shared signal that isn't one Wick Betts tracks — returns null,
 * and callers fall back to an initials badge rather than guessing at a logo.
 */
export function resolveLogoUrl(rawSymbol: string): string | null {
  const symbol = rawSymbol.trim().toUpperCase();
  const cached = cache?.quotes.find((q) => q.symbol === symbol);
  if (cached?.logoUrl) return cached.logoUrl;
  const meta = EQUITY_TICKERS[symbol];
  if (meta?.domain) return `https://logo.clearbit.com/${meta.domain}`;
  return null;
}

async function refreshAllQuotes(): Promise<QuoteItem[]> {
  // Fetch all equity tickers in parallel, plus crypto concurrently
  const equityEntries = Object.entries(EQUITY_TICKERS);
  const [equityResults, cryptoResults] = await Promise.all([
    Promise.allSettled(equityEntries.map(([symbol, meta]) => fetchNasdaqQuote(symbol, meta))),
    fetchCryptoQuotes(),
  ]);

  const quotes: QuoteItem[] = [];
  for (const result of equityResults) {
    if (result.status === "fulfilled" && result.value) {
      quotes.push(result.value);
    }
  }
  quotes.push(...cryptoResults);
  return quotes;
}

function getChicagoClockParts(now = new Date()): {
  year: string;
  month: string;
  day: string;
  hour: number;
  minute: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: map.year ?? "0000",
    month: map.month ?? "00",
    day: map.day ?? "00",
    hour: Number(map.hour ?? "0"),
    minute: Number(map.minute ?? "0"),
  };
}

function getScheduleSlotKey(now = new Date()): string | null {
  const clock = getChicagoClockParts(now);
  const totalMinutes = clock.hour * 60 + clock.minute;
  const onQuarterHour = clock.minute % 15 === 0;
  const inWindow = totalMinutes >= MARKET_OPEN_MINUTES && totalMinutes <= MARKET_CLOSE_MINUTES;
  if (!onQuarterHour || !inWindow) return null;
  return `${clock.year}-${clock.month}-${clock.day}-${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
}

async function ensureCache(reason: "startup" | "request-miss" | "scheduled"): Promise<CacheEntry> {
  if (!refreshPromise) {
    refreshPromise = refreshAllQuotes()
      .then((quotes) => {
        const nextCache = { quotes, fetchedAt: Date.now() };
        cache = nextCache;
        logger.info({ count: quotes.length, reason }, "Market quotes cache refreshed");
        return nextCache;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return await refreshPromise;
}

function startScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const tick = () => {
    const slotKey = getScheduleSlotKey();
    if (!slotKey || slotKey === lastScheduledSlot) return;
    lastScheduledSlot = slotKey;
    void ensureCache("scheduled").catch((err) => {
      logger.warn({ err, slotKey }, "Scheduled market refresh failed");
    });
  };

  void ensureCache("startup").catch((err) => {
    logger.warn({ err }, "Initial market cache warmup failed");
  });

  tick();
  setInterval(tick, 60 * 1000);
}

startScheduler();

// GET /api/market/quotes — members only (any active/grace-period subscription,
// admins always allowed). The live-priced board is paid content, same as
// signals and news.
router.get("/quotes", requireAuth, requireActiveSubscription, async (_req, res) => {
  if (cache) {
    const ageMs = Date.now() - cache.fetchedAt;
    res.json({
      quotes: cache.quotes,
      fetchedAt: cache.fetchedAt,
      delayedMinutes: 15,
      fresh: ageMs <= SCHEDULE_MS,
      stale: ageMs > CLIENT_POLL_MS,
      refreshIntervalMs: CLIENT_POLL_MS,
    });
    return;
  }
  try {
    const nextCache = await ensureCache("request-miss");
    res.json({
      quotes: nextCache.quotes,
      fetchedAt: nextCache.fetchedAt,
      delayedMinutes: 15,
      fresh: true,
      stale: false,
      refreshIntervalMs: CLIENT_POLL_MS,
    });
  } catch (err) {
    logger.error(err, "Market quotes fetch failed");
    res.status(502).json({ error: "Unable to fetch market data. Try again shortly." });
  }
});

// GET /api/market/tickers — a JSON dictionary of the top tickers in each
// sector, with live price info merged in from the quote cache. Purpose-built
// for ticker-picker UIs (e.g. the watchlist/signal-studio autocomplete):
// { sections: { indices: { SPY: { shortName, price, changePercent } }, ... } }
router.get("/tickers", (_req, res) => {
  const quoteBySymbol = new Map((cache?.quotes ?? []).map((q) => [q.symbol, q]));
  const sections: Record<string, Record<string, { shortName: string; price: number | null; changePercent: number | null; logoUrl: string | null }>> = {};

  const addEntry = (symbol: string, group: string, shortName: string) => {
    const quote = quoteBySymbol.get(symbol);
    if (!sections[group]) sections[group] = {};
    sections[group][symbol] = {
      shortName,
      price: quote?.price ?? null,
      changePercent: quote?.changePercent ?? null,
      logoUrl: quote?.logoUrl ?? resolveLogoUrl(symbol),
    };
  };

  for (const [symbol, meta] of Object.entries(EQUITY_TICKERS)) {
    addEntry(symbol, meta.group, meta.shortName);
  }
  for (const [symbol, meta] of Object.entries(CRYPTO_TICKERS)) {
    addEntry(symbol, "crypto", meta.shortName);
  }

  res.json({ sections, fetchedAt: cache?.fetchedAt ?? null });
});

export default router;
