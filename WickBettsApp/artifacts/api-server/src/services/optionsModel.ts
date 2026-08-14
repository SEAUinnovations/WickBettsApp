/**
 * Black-Scholes options pricing/Greeks, plus expiration and strike selection.
 *
 * There is no live options-chain data source wired in (real bid/ask, open
 * interest, and quoted IV require a paid provider like Tradier or Polygon).
 * Every number this module produces is MODELED from the underlying's price
 * and its own historical realized volatility as an IV proxy — not a live
 * market quote. Signals built from this are meant to land as "Watching" for
 * admin review, and their analysis text should say so explicitly.
 */

const RISK_FREE_RATE = 0.045; // approximate short-term Treasury yield; update periodically

function erf(x: number): number {
  // Abramowitz & Stegun 7.1.26 approximation — accurate to ~1.5e-7, plenty
  // for a modeled/estimated premium rather than a tradable quote.
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export interface OptionGreeks {
  price: number;
  delta: number;
  gamma: number;
  theta: number; // per calendar day
  vega: number; // per 1 vol point (1.00 = 100%)
}

/**
 * @param spot Underlying price
 * @param strike Strike price
 * @param daysToExpiration Calendar days until expiration
 * @param iv Annualized volatility, e.g. 0.42 for 42%
 */
export function blackScholes(
  spot: number,
  strike: number,
  daysToExpiration: number,
  iv: number,
  type: "Call" | "Put",
  riskFreeRate = RISK_FREE_RATE,
): OptionGreeks {
  const t = Math.max(daysToExpiration, 1) / 365;
  const sqrtT = Math.sqrt(t);
  const safeIv = Math.max(iv, 0.05); // floor so degenerate/zero-history IV doesn't blow up the math

  const d1 = (Math.log(spot / strike) + (riskFreeRate + (safeIv * safeIv) / 2) * t) / (safeIv * sqrtT);
  const d2 = d1 - safeIv * sqrtT;

  const isCall = type === "Call";
  const nD1 = normCdf(isCall ? d1 : -d1);
  const nD2 = normCdf(isCall ? d2 : -d2);
  const discount = Math.exp(-riskFreeRate * t);

  const price = isCall
    ? spot * nD1 - strike * discount * nD2
    : strike * discount * nD2 - spot * nD1;

  const delta = isCall ? normCdf(d1) : normCdf(d1) - 1;
  const gamma = normPdf(d1) / (spot * safeIv * sqrtT);
  const vega = (spot * normPdf(d1) * sqrtT) / 100; // per 1 vol point

  const theta = isCall
    ? (-(spot * normPdf(d1) * safeIv) / (2 * sqrtT) - riskFreeRate * strike * discount * normCdf(d2)) / 365
    : (-(spot * normPdf(d1) * safeIv) / (2 * sqrtT) + riskFreeRate * strike * discount * normCdf(-d2)) / 365;

  return {
    price: Math.max(price, 0.01),
    delta,
    gamma,
    theta,
    vega,
  };
}

/**
 * Nearest Friday between minDays and maxDays out (inclusive). Standard
 * weekly/monthly equity options expire on Fridays; a 7-14 day window always
 * contains at least one.
 */
export function pickExpiration(from: Date, minDays = 7, maxDays = 14): Date {
  for (let d = minDays; d <= maxDays; d++) {
    const candidate = new Date(from);
    candidate.setUTCDate(candidate.getUTCDate() + d);
    if (candidate.getUTCDay() === 5) return candidate;
  }
  // Shouldn't happen given the window always spans a Friday, but fall back
  // to the midpoint rather than throwing.
  const fallback = new Date(from);
  fallback.setUTCDate(fallback.getUTCDate() + Math.round((minDays + maxDays) / 2));
  return fallback;
}

/**
 * Strike selection: a modest out-of-the-money strike in the trade's
 * direction, rounded to a realistic increment for the price tier. Calls go
 * above spot, puts go below.
 */
export function pickStrike(spot: number, direction: "Long" | "Short", otmPercent = 0.03): number {
  const raw = direction === "Long" ? spot * (1 + otmPercent) : spot * (1 - otmPercent);
  const increment = spot >= 200 ? 5 : spot >= 100 ? 2.5 : 1;
  return Math.round(raw / increment) * increment;
}

export function formatExpirationLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function formatExpirationCode(date: Date): string {
  // e.g. "22 AUG 26" — matches the manual admin form's contract-string convention
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${day} ${month} ${year}`;
}
