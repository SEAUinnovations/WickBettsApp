# 0002: Automated signal scanner — design and trust model

## Status

Accepted.

## Context

The product needed an automated scanner covering stocks, crypto, and
options: RSI oversold/overbought crossed with support/resistance and
volume, restricted to stocks priced over $90 and outside the S&P 500 /
Nasdaq-100, producing 1-2 signals every 2 days with entries, targets,
stops, and news-event awareness.

Several constraints shaped the design:

- No live options-chain data provider (Tradier, Polygon, etc.) is
  configured or budgeted for.
- No paid stock screener API (Finviz's paid API, etc.) is configured;
  free/public endpoints (Nasdaq's own screener/historical APIs, Wikipedia,
  CoinGecko) had to suffice.
- This is real financial content reaching paying subscribers — an
  algorithmic scan producing a bad signal is a real liability/trust
  concern, not just a bug.

## Decision

**Signals land as `status: "Watching"`, never auto-published as `"Active"`
with a push notification.** An admin reviews, edits, or promotes each one.
This was an explicit product decision (asked and confirmed before
building), not a technical limitation — the scanner is fully capable of
inserting `"Active"` signals directly.

**Options data is modeled, not quoted.** Every stock setup becomes a
7-14 DTE option play priced via Black-Scholes off the underlying's own
realized volatility (annualized stdev of log returns) as an IV proxy, with
a scenario projection (flat / halfway-to-target / at-target / at-stop) so
the thesis shows how the position is expected to move — explicitly labeled
"MODELED" wherever it's surfaced, with a note to verify real bid/ask
before publishing.

**Every external fetch degrades gracefully rather than failing the run.**
Wikipedia table scraping for index membership, Nasdaq's screener/historical
APIs, and CoinGecko history are all wrapped so a single failure removes
that data point from consideration rather than crashing the scan. The run
always tries to produce 1-2 signals even if some inputs failed, falling
back to the highest-scoring near-miss if nothing strictly cleared the
RSI/proximity/volume thresholds that day (explicitly labeled as a
fallback in the generated thesis text).

**News-event awareness ("keep in mind" star)** checks FOMC dates (hardcoded
from federalreserve.gov, updated yearly), NFP (deterministic: first Friday
of month), an approximate CPI heuristic (no reliable free exact-date
source), and the symbol's own next earnings date (best-effort Nasdaq
lookup, non-fatal on failure) against the trade's expected holding window.

## Consequences

- Members see real signals in the feed quickly (the "signals tab comes to
  life" requirement) without the product taking on the liability of
  fully-automated, unreviewed trade calls.
- The options data quality ceiling is bounded by realized-volatility-as-IV,
  which is a real approximation — genuinely different from a live quoted
  IV, especially around earnings/events where actual IV would be elevated.
  This is disclosed in-product; upgrading to a real options-chain provider
  is a known future improvement, not attempted here due to cost/scope.
- Reliability of the stock universe and historical data depends on
  `api.nasdaq.com` and Wikipedia's HTML structure remaining stable —
  neither is a documented, versioned API. The sanity-check floor in
  `stockUniverse.ts` (reject a Wikipedia parse if it returns
  suspiciously few tickers) exists specifically to fail safe rather than
  silently trust a broken parse.
