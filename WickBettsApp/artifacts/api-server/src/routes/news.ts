import { Router, type Request, type Response } from "express";
import { XMLParser } from "fast-xml-parser";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, newsOverridesTable } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth.js";
import { requireActiveSubscription } from "./signals.js";

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
  imageUrl: string | null;
}

interface NewsArticleOverride {
  sourceArticleId: string;
  headline: string | null;
  summary: string | null;
  category: string | null;
  source: string | null;
  url: string | null;
  publishedAt: string | null;
  hidden: boolean;
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
//
// `strict: true` sources pull from general "top stories" / "business"
// verticals that mix in personal-finance advice columns and lifestyle
// pieces alongside real market news (verified by direct fetch — MarketWatch
// Top Stories in particular carries the "Moneyist" advice column), so they
// get the full market-keyword relevance filter on top of the junk-pattern
// filter. `strict: false` sources are narrow, wire-style headline feeds
// (MarketWatch Real-time Headlines, MarketPulse) that are market/macro/
// analyst content by construction — same junk filter, but not required to
// also match a market keyword, since real headlines there are sometimes
// too terse (e.g. "Dollar jumps 0.5% to 0.8890 francs") to hit every term.
const RSS_SOURCES = [
  {
    url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
    name: "WSJ Markets",
    defaultCategory: "Markets",
    strict: true,
  },
  {
    url: "https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml",
    name: "WSJ Business",
    defaultCategory: "Markets",
    strict: true,
  },
  {
    url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
    name: "MarketWatch",
    defaultCategory: "Markets",
    strict: true,
  },
  {
    url: "https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines",
    name: "MarketWatch",
    defaultCategory: "Markets",
    strict: false,
  },
  {
    url: "https://feeds.content.dowjones.io/public/rss/mw_marketpulse",
    name: "MarketWatch",
    defaultCategory: "Markets",
    strict: false,
  },
];

function guessCategory(title: string): string {
  const t = title.toLowerCase();
  if (/analyst|price target|started at (buy|sell|hold|neutral|outperform|underperform)|initiat(ed|es) (at|coverage)|upgrades?|downgrades?|rated (buy|sell|hold|overweight|underweight)/.test(t)) return "Analyst";
  if (/bitcoin|crypto|ethereum|btc|eth|defi|blockchain/.test(t)) return "Crypto";
  if (/fed|inflation|rates?|cpi|fomc|powell|treasury|jobless|payrolls|\bpmi\b|\bgdp\b/.test(t)) return "Macro";
  if (/earnings?|revenue|guidance|eps|profit|loss/.test(t)) return "Earnings";
  if (/oil|energy|gold|commodity|crude/.test(t)) return "Commodities";
  if (/\bnvda\b|nvidia|chip|semiconductor|ai\b|artificial intelligence/.test(t)) return "Tech";
  if (/bank|finance|jpmorgan|goldman|credit/.test(t)) return "Finance";
  return "Markets";
}

// Bylines known to write personal-finance advice columns (e.g. MarketWatch's
// "Moneyist") rather than market/business news — excluded regardless of
// which feed they show up in. Verified directly against live feed output:
// every "My son/husband/friend..." advice piece in MarketWatch Top Stories
// carried this byline.
const JUNK_BYLINES = new Set(["Quentin Fottrell"]);

// Headline/summary patterns that reliably signal a personal-advice-column,
// lifestyle, or unrelated-to-markets piece, even without a matching byline.
const JUNK_PATTERNS: RegExp[] = [
  /\bmy (son|daughter|husband|wife|mother|father|friend|parents?|brother|sister)\b/i,
  /\bis (that|this) fair\??/i,
  /\bcan (she|he|they|i|we) (stop|afford)\b/i,
  /\bmediterranean diet\b|\bbest diet\b/i,
  /\bdementia\b/i,
  /\baffordable care act\b|\baca subsidy\b|\bhealth insurance subsidy\b/i,
  /\bmedicaid\b/i,
];

// Requiring at least one of these on "strict" sources keeps genuine
// market/business content — earnings, guidance, deals, macro data, analyst
// calls, sector news — and drops unrelated lifestyle/personal-finance
// pieces that slip into general "top stories" and "business" verticals.
const MARKET_KEYWORDS =
  /\b(stock|stocks|share|shares|equit(y|ies)|market|markets|nasdaq|s&p|dow jones|russell|ftse|nikkei|stoxx|earnings|revenue|profit|guidance|forecast|outlook|analyst|rating|upgrade|downgrade|price target|ipo|merger|acquisition|acquire|buyout|takeover|\bdeal\b|\bfed\b|federal reserve|rate cut|rate hike|interest rate|inflation|\bcpi\b|\bpmi\b|\bgdp\b|jobless|payrolls|treasury|\byield\b|\bbond\b|crypto|bitcoin|ethereum|\boil\b|crude|\bgold\b|\bsilver\b|commodit(y|ies)|\bsector\b|\bceo\b|chief executive|dividend|buyback|trading|wall street|\betf\b|hedge fund|quarterly|fiscal|\bchip\b|semiconductor|tariff|layoffs?|\brecall\b|lawsuit|antitrust|regulator|\bsec\b|\bftc\b|banks?|\brally\b|sell-?off|volatility|investors?|portfolio|\btrade\b)/i;

function isJunkArticle(headline: string, summary: string, byline: string): boolean {
  if (byline && JUNK_BYLINES.has(byline.trim())) return true;
  const text = `${headline} ${summary}`;
  return JUNK_PATTERNS.some((re) => re.test(text));
}

function isMarketRelevant(headline: string, summary: string): boolean {
  return MARKET_KEYWORDS.test(`${headline} ${summary}`);
}

/**
 * Extracts a preview image URL from an RSS item's <media:content>,
 * <media:thumbnail>, or <enclosure> tag, when present. Not every feed
 * includes one — MarketWatch's wire-headline feeds (Real-time Headlines,
 * MarketPulse) never do, which is expected and fine; the article just
 * renders without a thumbnail.
 */
function xmlImage(item: Record<string, unknown>): string | null {
  const candidates = [item["media:content"], item["media:thumbnail"], item["enclosure"]];
  for (const raw of candidates) {
    if (!raw) continue;
    const nodes = Array.isArray(raw) ? raw : [raw];
    for (const node of nodes) {
      if (typeof node !== "object" || node === null) continue;
      const obj = node as Record<string, unknown>;
      const url = typeof obj["url"] === "string" ? obj["url"] : "";
      const type = typeof obj["type"] === "string" ? obj["type"] : "";
      const medium = typeof obj["medium"] === "string" ? obj["medium"] : "";
      if (!url) continue;
      if (type && !type.startsWith("image")) continue;
      if (medium && medium !== "image") continue;
      if (type.startsWith("image") || medium === "image" || /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url)) {
        return url;
      }
    }
  }
  return null;
}

/**
 * Safely coerce an XML node's parsed value into plain text.
 *
 * fast-xml-parser (with ignoreAttributes:false) turns tags that carry
 * attributes but no text content — e.g. Atom's `<link href="...">` or an
 * RSS `<guid isPermaLink="true">url</guid>` — into an object like
 * `{ href: "..." }` or `{ "#text": "...", isPermaLink: "true" }` rather
 * than a string. Naively calling String() on that object previously
 * produced the literal text "[object Object]", silently corrupting the
 * article's link/id. This normalizes any of those shapes back to a string.
 */
function xmlText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj["#text"] === "string") return obj["#text"];
    if (typeof obj["href"] === "string") return obj["href"];
    if (typeof obj["url"] === "string") return obj["url"];
  }
  return "";
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

  const candidates = rawItems.slice(0, 20).map((item) => {
    const it = item as Record<string, unknown>;
    const title = xmlText(it["title"]);
    const link = xmlText(it["link"]) || xmlText(it["guid"]);
    const pubDate = xmlText(it["pubDate"] ?? it["published"] ?? it["updated"]);
    const desc = xmlText(it["description"] ?? it["summary"] ?? it["content"]);
    const byline = xmlText(it["dc:creator"] ?? it["author"]);
    // Strip HTML tags/entities from description
    const summary = desc
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .slice(0, 200)
      .trim();
    const article: NewsArticle = {
      id: link || title,
      headline: title,
      source: source.name,
      url: link,
      publishedAt: pubDate,
      category: guessCategory(title),
      summary: summary || title,
      imageUrl: xmlImage(it),
    };
    return { article, byline };
  });

  // Verified/real-source only: drop personal-finance advice columns and
  // lifestyle pieces everywhere, and on "mixed" feeds additionally require a
  // real market/business keyword match — see the RSS_SOURCES comment above.
  return candidates
    .filter(({ article }) => article.headline.trim().length > 0)
    .filter(({ article, byline }) => !isJunkArticle(article.headline, article.summary, byline))
    .filter(({ article }) => !source.strict || isMarketRelevant(article.headline, article.summary))
    .map(({ article }) => article);
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
      hidden: newsOverridesTable.hidden,
    })
    .from(newsOverridesTable);
}

/** Applies admin edits and drops any article an admin has removed (hidden). */
function applyOverrides(articles: NewsArticle[], overrides: NewsArticleOverride[]): NewsArticle[] {
  if (overrides.length === 0) return articles;
  const overrideMap = new Map(overrides.map((item) => [item.sourceArticleId, item]));
  return articles
    .filter((article) => !overrideMap.get(article.id)?.hidden)
    .map((article) => {
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

// GET /api/news/feed — members only (any active/grace-period subscription,
// admins always allowed). News used to be public; it's now paywalled
// alongside signals so browsing it isn't a way to skip subscribing.
router.get("/feed", requireAuth, requireActiveSubscription, async (_req, res) => {
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

// DELETE /api/news/articles — remove an article from the member feed (admin
// only). Article ids are RSS-sourced and are frequently full URLs (see
// fetchRss: `id: link || title`), so — same as PATCH /overrides just above
// — the id travels in the JSON body rather than a URL path segment. A path
// param would need round-tripping through encodeURIComponent on the way in
// and Express's automatic decoding on the way out; an extra decode on top of
// that (which a path-param version of this route previously did) can mangle
// any id that itself contains a "%" (common in URLs with encoded query
// params), silently saving the hidden-flag under a key that never matches
// the real article — so the delete appears to succeed but nothing actually
// disappears from the feed. The body-based approach sidesteps that class of
// bug entirely.
//
// This is a soft delete: it upserts a `hidden: true` override keyed by the
// article's source id (same id scheme as GET /feed and PATCH /overrides),
// and GET /feed filters any hidden article out for everyone, admins
// included — same end result as the hard-delete used for signals.
router.delete("/articles", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const user = req.dbUser!;
  const { sourceArticleId: rawId } = req.body as { sourceArticleId?: string };
  const sourceArticleId = typeof rawId === "string" ? rawId.trim() : "";
  if (!sourceArticleId) {
    res.status(400).json({ error: "sourceArticleId is required" });
    return;
  }

  try {
    const existing = await db
      .select()
      .from(newsOverridesTable)
      .where(eq(newsOverridesTable.sourceArticleId, sourceArticleId))
      .limit(1);

    if (existing[0]) {
      await db
        .update(newsOverridesTable)
        .set({ hidden: true, updatedBy: user.id, updatedAt: new Date() })
        .where(eq(newsOverridesTable.sourceArticleId, sourceArticleId));
    } else {
      await db.insert(newsOverridesTable).values({
        id: randomUUID(),
        sourceArticleId,
        hidden: true,
        updatedBy: user.id,
      } as any);
    }

    logger.info({ sourceArticleId, adminId: user.id }, "News article removed from feed");
    res.json({ ok: true });
  } catch (err) {
    logger.error(err, "Failed to remove news article");
    res.status(500).json({ error: "Failed to remove article" });
  }
});

export default router;
