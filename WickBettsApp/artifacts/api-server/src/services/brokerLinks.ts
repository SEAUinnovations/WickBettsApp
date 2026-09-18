/**
 * "Trade on your broker" links for the Signals feed.
 *
 * Plain outbound links to the asset's own page on Webull / Robinhood —
 * deliberately NOT an order prefill and NOT an order-routing integration.
 * The member lands on the stock (or crypto) page, opens the chain or ticket
 * themselves, picks the contract, and decides whether to trade at the live
 * price. Wick Betts never sees or touches a brokerage account.
 *
 * Built server-side (like logoUrl) so a broker changing its URL format is a
 * Railway redeploy, not an App Store resubmission.
 *
 * URL formats (checked against each broker's public quote pages, Sept 2026):
 *   Webull     https://www.webull.com/quote/nasdaq-nvda   (needs the exchange)
 *              https://www.webull.com/quote/ccc-btcusd     (crypto)
 *   Robinhood  https://robinhood.com/us/en/stocks/NVDA/
 *              https://robinhood.com/us/en/crypto/BTC/
 * Neither broker documents these as official deep links — re-verify on a
 * real iPhone/Android (app installed and not installed) after any change.
 */
import { NASDAQ_HEADERS } from "./httpHeaders.js";
import { logger } from "../lib/logger.js";

export type BrokerId = "webull" | "robinhood";

export interface BrokerLink {
  broker: BrokerId;
  label: string;
  url: string;
}

interface SignalLike {
  asset: string;
  market: string;
  status: string;
  style: string;
  sector: string | null;
}

/** Only live stock/crypto/options calls get links. Futures day trades are
 *  excluded (separate CFTC scope, and neither link format covers them). */
export function isBrokerLinkEligible(s: SignalLike): boolean {
  if (s.status !== "Active") return false;
  if (s.style === "Day Trade") return false;
  if (s.sector && /futures/i.test(s.sector)) return false;
  return s.market === "Stocks" || s.market === "Crypto";
}

/** "BTC-USD" / "BTC/USD" / "BTCUSD" / "btc" → "BTC" */
function cryptoBase(asset: string): string {
  const head = asset.trim().toUpperCase().split(/[-/\s]/)[0] ?? "";
  return head.replace(/(USDT|USDC|USD)$/, "") || head;
}

/** Plain equity ticker, e.g. "NVDA", "BRK.B". Anything else gets no links. */
function stockTicker(asset: string): string | null {
  const t = asset.trim().toUpperCase();
  return /^[A-Z]{1,5}([.-][A-Z])?$/.test(t) ? t : null;
}

// ── Exchange lookup (Webull's URL needs it; signals don't store it) ──

const EXCHANGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EXCHANGE_MISS_TTL_MS = 60 * 60 * 1000;
const exchangeCache = new Map<string, { slug: string | null; expiresAt: number }>();
const inFlight = new Map<string, Promise<string | null>>();

/** Nasdaq's "exchange" label → Webull's URL prefix. */
function toWebullExchangeSlug(label: string): string | null {
  const l = label.toUpperCase();
  if (l.startsWith("NASDAQ")) return "nasdaq";
  if (l.includes("ARCA")) return "nysearca";
  if (l.includes("AMERICAN") || l.includes("AMEX") || l.includes("MKT")) return "amex";
  if (l.startsWith("NYSE")) return "nyse";
  return null;
}

async function fetchExchangeSlug(ticker: string): Promise<string | null> {
  for (const assetclass of ["stocks", "etf"]) {
    try {
      const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(ticker)}/info?assetclass=${assetclass}`;
      const res = await fetch(url, { headers: NASDAQ_HEADERS, signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      const json = (await res.json()) as { data?: { exchange?: string | null } | null };
      const label = json?.data?.exchange;
      if (label) return toWebullExchangeSlug(label);
    } catch (err) {
      logger.warn({ err, ticker, assetclass }, "Exchange lookup for broker link failed");
    }
  }
  return null;
}

async function resolveWebullExchange(ticker: string): Promise<string | null> {
  const hit = exchangeCache.get(ticker);
  if (hit && hit.expiresAt > Date.now()) return hit.slug;
  const pending = inFlight.get(ticker);
  if (pending) return pending;
  const p = fetchExchangeSlug(ticker)
    .then((slug) => {
      exchangeCache.set(ticker, { slug, expiresAt: Date.now() + (slug ? EXCHANGE_TTL_MS : EXCHANGE_MISS_TTL_MS) });
      return slug;
    })
    .finally(() => inFlight.delete(ticker));
  inFlight.set(ticker, p);
  return p;
}

/**
 * Links for one signal, in a stable order (Webull, Robinhood). The client
 * reorders by the member's remembered preference. Returns [] when the
 * signal isn't eligible. Never throws — a failed exchange lookup just drops
 * the Webull link for now.
 */
export async function buildBrokerLinks(s: SignalLike): Promise<BrokerLink[]> {
  if (!isBrokerLinkEligible(s)) return [];

  if (s.market === "Crypto") {
    const base = cryptoBase(s.asset);
    if (!/^[A-Z0-9]{2,10}$/.test(base)) return [];
    return [
      { broker: "webull", label: "Webull", url: `https://www.webull.com/quote/ccc-${base.toLowerCase()}usd` },
      { broker: "robinhood", label: "Robinhood", url: `https://robinhood.com/us/en/crypto/${base}/` },
    ];
  }

  const ticker = stockTicker(s.asset);
  if (!ticker) return [];
  const links: BrokerLink[] = [];
  const exch = await resolveWebullExchange(ticker);
  if (exch) {
    const webullTicker = ticker.toLowerCase().replace(".", "-");
    links.push({ broker: "webull", label: "Webull", url: `https://www.webull.com/quote/${exch}-${webullTicker}` });
  }
  links.push({ broker: "robinhood", label: "Robinhood", url: `https://robinhood.com/us/en/stocks/${ticker}/` });
  return links;
}
