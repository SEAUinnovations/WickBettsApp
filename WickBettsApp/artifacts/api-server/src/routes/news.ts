import { Router } from "express";
import { XMLParser } from "fast-xml-parser";
import { logger } from "../lib/logger.js";

const router = Router();
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

interface NewsArticle {
  id: string;
  headline: string;
  source: string;
  url: string;
  publishedAt: string;
  category: string;
  summary: string;
}

interface NewsCache {
  articles: NewsArticle[];
  fetchedAt: number;
}

// In-memory cache — refreshed by a server-owned scheduler during market hours.
let cache: NewsCache | null = null;
const SCHEDULE_MS = 15 * 60 * 1000;
const CLIENT_POLL_MS = 15 * 60 * 1000;
const MARKET_TIMEZONE = "America/Chicago";
const MARKET_OPEN_MINUTES = 7 * 60;
const MARKET_CLOSE_MINUTES = 16 * 60;

let refreshPromise: Promise<NewsCache> | null = null;
let schedulerStarted = false;
let lastScheduledSlot: string | null = null;

const RSS_SOURCES = [
  {
    url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC,^IXIC,^DJI&region=US&lang=en-US",
    name: "Yahoo Finance",
    defaultCategory: "Markets",
  },
  {
    url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839135",
    name: "CNBC Markets",
    defaultCategory: "Markets",
  },
  {
    url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
    name: "WSJ Markets",
    defaultCategory: "Markets",
  },
];

function guessCategory(title: string): string {
  const t = title.toLowerCase();
  if (/bitcoin|crypto|ethereum|btc|eth|defi|blockchain/.test(t)) return "Crypto";
  if (/fed|inflation|rates?|cpi|fomc|powell|treasury/.test(t)) return "Macro";
  if (/earnings?|revenue|guidance|eps|profit|loss/.test(t)) return "Earnings";
  if (/oil|energy|gold|commodity|crude/.test(t)) return "Commodities";
  if (/\bnvda\b|nvidia|chip|semiconductor|ai\b|artificial intelligence/.test(t)) return "Tech";
  if (/bank|finance|jpmorgan|goldman|credit/.test(t)) return "Finance";
  return "Markets";
}

async function fetchRss(source: typeof RSS_SOURCES[0]): Promise<NewsArticle[]> {
  const res = await fetch(source.url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; WickBetts/1.0; +https://wickbetts.com)",
      Accept: "application/rss+xml, application/xml, text/xml",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${source.name} returned ${res.status}`);
  const xml = await res.text();
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const channel = (parsed["rss"] as Record<string, unknown>)?.["channel"] as Record<string, unknown> | undefined
    ?? (parsed["feed"] as Record<string, unknown>);
  if (!channel) return [];

  const rawItems: unknown[] = Array.isArray(channel["item"])
    ? (channel["item"] as unknown[])
    : channel["item"]
    ? [channel["item"]]
    : Array.isArray(channel["entry"])
    ? (channel["entry"] as unknown[])
    : channel["entry"]
    ? [channel["entry"]]
    : [];

  return rawItems.slice(0, 20).map((item) => {
    const it = item as Record<string, unknown>;
    const title = String(it["title"] ?? "");
    const link = String(it["link"] ?? it["guid"] ?? "");
    const pubDate = String(it["pubDate"] ?? it["published"] ?? it["updated"] ?? "");
    const desc = String(it["description"] ?? it["summary"] ?? it["content"] ?? "");
    // Strip HTML tags from description
    const summary = desc.replace(/<[^>]*>/g, "").slice(0, 200).trim();
    return {
      id: link || title,
      headline: title,
      source: source.name,
      url: link,
      publishedAt: pubDate,
      category: guessCategory(title),
      summary: summary || title,
    };
  });
}

async function refreshCache(): Promise<NewsArticle[]> {
  const results = await Promise.allSettled(RSS_SOURCES.map(fetchRss));
  const all: NewsArticle[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
    else logger.warn({ err: r.reason }, "RSS source failed");
  }
  // Deduplicate by headline similarity, sort newest first
  const seen = new Set<string>();
  const deduped = all.filter((a) => {
    const key = a.headline.slice(0, 60).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  deduped.sort((a, b) => {
    const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return db - da;
  });
  return deduped.slice(0, 40);
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

async function ensureCache(reason: "startup" | "request-miss" | "scheduled"): Promise<NewsCache> {
  if (!refreshPromise) {
    refreshPromise = refreshCache()
      .then((articles) => {
        const nextCache: NewsCache = { articles, fetchedAt: Date.now() };
        cache = nextCache;
        logger.info({ count: articles.length, reason }, "News feed cache refreshed");
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
      logger.warn({ err, slotKey }, "Scheduled news refresh failed");
    });
  };

  // Prime once on server boot so the first request does not always pay the fetch cost.
  void ensureCache("startup").catch((err) => {
    logger.warn({ err }, "Initial news cache warmup failed");
  });

  tick();
  setInterval(tick, 60 * 1000);
}

startScheduler();

// GET /api/news/feed
router.get("/feed", async (_req, res) => {
  if (cache) {
    const ageMs = Date.now() - cache.fetchedAt;
    res.json({
      articles: cache.articles,
      cachedAt: cache.fetchedAt,
      fresh: ageMs <= SCHEDULE_MS,
      stale: ageMs > CLIENT_POLL_MS,
      refreshIntervalMs: CLIENT_POLL_MS,
    });
    return;
  }

  try {
    const nextCache = await ensureCache("request-miss");
    res.json({
      articles: nextCache.articles,
      cachedAt: nextCache.fetchedAt,
      fresh: true,
      stale: false,
      refreshIntervalMs: CLIENT_POLL_MS,
    });
  } catch (err) {
    logger.error(err, "News feed refresh failed");
    res.status(502).json({ error: "Unable to fetch news feed. Try again shortly." });
  }
});

export default router;
