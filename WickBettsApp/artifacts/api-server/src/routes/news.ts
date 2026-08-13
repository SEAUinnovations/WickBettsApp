import { Router, type Request, type Response } from "express";
import { XMLParser } from "fast-xml-parser";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, newsOverridesTable } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth.js";

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

interface NewsArticleOverride {
  sourceArticleId: string;
  headline: string | null;
  summary: string | null;
  category: string | null;
  source: string | null;
  url: string | null;
  publishedAt: string | null;
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

// Yahoo Finance and CNBC's public RSS endpoints were retired (they now
// return empty bodies) — verified by direct fetch before swapping. These
// Dow Jones-family feeds are current and don't require an API key. Five
// sources gives real redundancy: RSS scraping only needs one to succeed.
const RSS_SOURCES = [
  {
    url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
    name: "WSJ Markets",
    defaultCategory: "Markets",
  },
  {
    url: "https://feeds.a.dj.com/rss/RSSWorldNews.xml",
    name: "WSJ World News",
    defaultCategory: "Markets",
  },
  {
    url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
    name: "MarketWatch",
    defaultCategory: "Markets",
  },
  {
    url: "https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines",
    name: "MarketWatch",
    defaultCategory: "Markets",
  },
  {
    url: "https://feeds.content.dowjones.io/public/rss/mw_marketpulse",
    name: "MarketWatch",
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

async function fetchOverrides(): Promise<NewsArticleOverride[]> {
  return await db
    .select({
      sourceArticleId: newsOverridesTable.sourceArticleId,
      headline: newsOverridesTable.headline,
      summary: newsOverridesTable.summary,
      category: newsOverridesTable.category,
      source: newsOverridesTable.source,
      url: newsOverridesTable.url,
      publishedAt: newsOverridesTable.publishedAt,
    })
    .from(newsOverridesTable);
}

function applyOverrides(articles: NewsArticle[], overrides: NewsArticleOverride[]): NewsArticle[] {
  if (overrides.length === 0) return articles;
  const overrideMap = new Map(overrides.map((item) => [item.sourceArticleId, item]));
  return articles.map((article) => {
    const override = overrideMap.get(article.id);
    if (!override) return article;
    return {
      ...article,
      headline: override.headline || article.headline,
      summary: override.summary || article.summary,
      category: override.category || article.category,
      source: override.source || article.source,
      url: override.url || article.url,
      publishedAt: override.publishedAt || article.publishedAt,
    };
  });
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
  const overrides = await fetchOverrides().catch((err) => {
    logger.warn({ err }, "Failed to fetch news overrides");
    return [] as NewsArticleOverride[];
  });
  if (cache) {
    const ageMs = Date.now() - cache.fetchedAt;
    res.json({
      articles: applyOverrides(cache.articles, overrides),
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
      articles: applyOverrides(nextCache.articles, overrides),
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

router.get("/overrides", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const overrides = await db.select().from(newsOverridesTable);
    res.json({ overrides });
  } catch (err) {
    logger.error(err, "Failed to fetch news overrides");
    res.status(500).json({ error: "Failed to fetch news overrides" });
  }
});

router.patch("/overrides", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const user = req.dbUser!;
  const { sourceArticleId, headline, summary, category, source, url, publishedAt } = req.body as {
    sourceArticleId?: string;
    headline?: string;
    summary?: string;
    category?: string;
    source?: string;
    url?: string;
    publishedAt?: string;
  };

  if (!sourceArticleId?.trim()) {
    res.status(400).json({ error: "sourceArticleId is required" });
    return;
  }

  const normalizedId = sourceArticleId.trim();
  const payload = {
    headline: typeof headline === "string" ? (headline.trim() || null) : null,
    summary: typeof summary === "string" ? (summary.trim() || null) : null,
    category: typeof category === "string" ? (category.trim() || null) : null,
    source: typeof source === "string" ? (source.trim() || null) : null,
    url: typeof url === "string" ? (url.trim() || null) : null,
    publishedAt: typeof publishedAt === "string" ? (publishedAt.trim() || null) : null,
    updatedBy: user.id,
    updatedAt: new Date(),
  };

  try {
    const existing = await db
      .select()
      .from(newsOverridesTable)
      .where(eq(newsOverridesTable.sourceArticleId, normalizedId))
      .limit(1);

    if (existing[0]) {
      await db
        .update(newsOverridesTable)
        .set(payload)
        .where(eq(newsOverridesTable.sourceArticleId, normalizedId));
    } else {
      await db.insert(newsOverridesTable).values({
        id: randomUUID(),
        sourceArticleId: normalizedId,
        ...payload,
      } as any);
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error(err, "Failed to save news override");
    res.status(500).json({ error: "Failed to save news override" });
  }
});

export default router;
