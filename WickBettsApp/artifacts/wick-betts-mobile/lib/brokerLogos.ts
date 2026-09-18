/**
 * Broker / platform logos, fetched from each company's own site icon via
 * Google's public favicon service — no image files bundled, no new
 * dependency. Rendered through TickerIcon, which falls back to an initials
 * badge if the image fails to load, so a blocked or missing icon never
 * leaves a blank hole.
 *
 * Logos are used only to identify the company next to a link to its own
 * site (nominative use) — never to imply the company endorses Wick Betts.
 */
export function brokerLogoUrl(domain: string, size = 128): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/** Domains for the "Trade it yourself" buttons on signal cards. */
export const TRADE_BROKER_DOMAINS: Record<'webull' | 'robinhood', string> = {
  webull: 'webull.com',
  robinhood: 'robinhood.com',
};
