/**
 * Shared request headers for external data fetches.
 *
 * Previously duplicated verbatim across marketHistory.ts, stockUniverse.ts,
 * and economicCalendar.ts — consolidated here so there's one place to
 * update the User-Agent string (e.g. if Nasdaq ever starts rejecting it)
 * instead of three.
 */

/**
 * Nasdaq's public API (api.nasdaq.com) 403s requests that look
 * script-generated — no User-Agent, missing Origin/Referer, or a bare
 * `fetch` default. This mimics a real browser request from nasdaq.com
 * itself, which is what actually gets a 200 back.
 */
export const NASDAQ_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.nasdaq.com",
  Referer: "https://www.nasdaq.com/",
};
