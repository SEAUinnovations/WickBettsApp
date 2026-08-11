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

// In-memory cache — refreshes every 5 minutes
let cache: { articles: NewsArticle[]; fetchedAt: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

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

// GET /api/news/feed
router.get("/feed", async (_req, res) => {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) {
    res.json({ articles: cache.articles, cachedAt: cache.fetchedAt, fresh: false });
    return;
  }
  try {
    const articles = await refreshCache();
    cache = { articles, fetchedAt: Date.now() };
    res.json({ articles, cachedAt: cache.fetchedAt, fresh: true });
  } catch (err) {
    logger.error(err, "News feed refresh failed");
    if (cache) {
      res.json({ articles: cache.articles, cachedAt: cache.fetchedAt, fresh: false, stale: true });
    } else {
      res.status(502).json({ error: "Unable to fetch news feed. Try again shortly." });
    }
  }
});

export default router;
