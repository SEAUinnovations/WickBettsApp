# 0005: Raw `fetch` over provider SDKs for external integrations

## Status

Accepted.

## Context

This app talks to several external services with no official/stable API
contract available to it: Nasdaq's undocumented `api.nasdaq.com` endpoints
(screener, historical bars, earnings calendar), Wikipedia (index
constituent tables via HTML scraping), and CoinGecko's public market-chart
endpoint. It also talks to genuinely documented, SDK-backed services:
Stripe, OpenAI, Clerk.

## Decision

For the undocumented/scraped sources, every fetch follows the same shape:
plain `fetch()` with a browser-mimicking `User-Agent`/`Origin`/`Referer`
(Nasdaq 403s bare requests — see `services/httpHeaders.ts`), a
timeout (`AbortSignal.timeout(...)`), defensive parsing of a response
shape that isn't contractually guaranteed to stay stable, and a
try/catch that logs and returns an empty/null result rather than
throwing. `Promise.allSettled` is used wherever multiple independent
fetches happen in parallel (e.g. batch-screening symbols in
`signalScanner.ts`), so one bad symbol doesn't take down the batch.

For genuinely documented services with official SDKs already present as
dependencies (`stripe`, `openai`, `@clerk/express`), use the SDK — no
reason to hand-roll HTTP calls to a stable, versioned API.

**The one deliberate exception this session:** `services/tradeReviewAI.ts`
was initially built against Claude's Messages API via raw `fetch` (no
`@anthropic-ai/sdk` dependency existed in this repo), then switched to
OpenAI's already-installed SDK per a later product decision — see ADR
0003. Had Claude been kept, the raw-fetch approach there wasn't a stylistic
choice so much as a hard constraint: adding a new npm dependency without a
working `pnpm install` environment to regenerate `pnpm-lock.yaml` would
break `pnpm install --frozen-lockfile` in the Docker build. That
constraint is the actual reason every new external integration added in
this session avoided introducing dependencies, documented directly in each
affected file's header comment (`tradeReviewAI.ts`, `rateLimit.ts`,
`securityHeaders.ts`).

## Consequences

- Reliability of the Nasdaq/Wikipedia-backed features (stock universe,
  historical bars, earnings dates) is bounded by those sources' HTML/JSON
  shapes staying stable — they can change without notice since they're not
  versioned public APIs. `stockUniverse.ts`'s sanity-check floor (reject a
  Wikipedia parse that returns suspiciously few tickers) is the pattern to
  follow for any future scrape-based source: fail safe to a fallback
  rather than trust a broken parse silently.
- Anyone adding a new external integration should default to this same
  pattern (raw fetch, defensive parsing, graceful degradation) unless the
  service has both an official SDK AND that SDK is already a resolved
  dependency in `pnpm-lock.yaml`. If a new SDK is genuinely warranted, it
  needs `pnpm install` run in a real dev environment (updating the
  lockfile) before it can safely ship — not just an addition to
  `package.json`.
