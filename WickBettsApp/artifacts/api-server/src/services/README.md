# services/

Business logic that isn't a direct HTTP handler lives here. Route files in
`../routes/` stay thin — they validate input, call into these services, and
shape the response; the actual work happens here.

## Automated signal scanner

A pipeline of six modules, called in this order by `signalScanner.ts`,
which self-starts a 2-day interval scheduler on import (see
`routes/index.ts`'s side-effect import):

1. **`stockUniverse.ts`** — builds the candidate stock list: price > $90,
   excludes S&P 500 / Nasdaq-100 members (Wikipedia-scraped, weekly cache,
   falls back to a hardcoded baseline set on parse failure), ranked by
   volume via Nasdaq's screener API.
2. **`marketHistory.ts`** — fetches daily OHLCV bars per symbol (Nasdaq for
   stocks, CoinGecko for crypto).
3. **`technicalAnalysis.ts`** — pure math over those bars: RSI(14), rolling
   20-day support/resistance, volume ratio, realized volatility, SMA
   trend context. No I/O — this is the only easily unit-testable piece.
4. **`optionsModel.ts`** — Black-Scholes premium/Greeks for the stock
   setups (there's no live options-chain data source configured — this is
   explicitly modeled, not quoted, and every signal built from it says so).
5. **`economicCalendar.ts`** — flags whether a signal's holding window
   crosses FOMC/CPI/jobs-report dates or the symbol's own earnings date
   (the "keep in mind" star), and exports a synchronous `fomcWithinRange()`
   used as a ranking factor (see next item).
6. **`macroConfluence.ts`** — cross-asset VIX/Dollar/Gold/Bonds regime read
   (Risk-On/Risk-Off/Mixed), used alongside FOMC-window proximity as a
   secondary "decision factor" that nudges candidate ranking on top of the
   pure technical score — see `docs/adr/0008-macro-confluence-decision-factor.md`.

`signalScanner.ts` ties these together, screens both stocks and crypto,
picks the 1-2 best-fitting setups, and inserts them as `status: "Watching"`
for admin review — never auto-published live. See
`docs/adr/0002-automated-signal-scanner-design.md`. Each chosen setup also
gets an automatic `style` (Swing/LEAPS/Buy & Hold) based on trend
conviction — see `docs/adr/0009-automated-leaps-buy-hold-signals.md`.

## Trade review AI

**`tradeReviewAI.ts`** — calls OpenAI's vision API (chat completions,
`gpt-4o`) to review a member-submitted chart screenshot against their
stated bias. Fully synchronous/automated (no admin gate), unlike the
signal scanner above — see
`docs/adr/0003-trade-review-ai-provider.md` for why this feature trusts
the model's output directly while the scanner doesn't.

## Shared utilities

**`httpHeaders.ts`** — the browser-mimicking headers required to get a 200
back from `api.nasdaq.com` (bare `fetch` calls get 403'd). Used by
`marketHistory.ts`, `stockUniverse.ts`, and `economicCalendar.ts` — update
once here if Nasdaq ever changes what it accepts, instead of in three
places.

## Conventions to preserve when adding to this directory

- **No new npm dependencies without updating `pnpm-lock.yaml` yourself.**
  The Docker build runs `pnpm install --frozen-lockfile`; an unresolved
  lockfile mismatch fails the build. Every service in this repo talks to
  external APIs via raw `fetch()` rather than a provider SDK for exactly
  this reason (see `tradeReviewAI.ts`'s header comment for the one
  exception — `openai` was already a dependency before this session).
- **Every external fetch degrades gracefully.** Wrap in try/catch, return
  an empty result or `null` on failure, log at `debug` or `warn` rather
  than `error` for expected flakiness (a single symbol's history fetch
  failing shouldn't be alarming; log `error` for things that indicate a
  real bug). Nothing in this directory should throw an unhandled rejection
  that takes down a scheduled job.
- **Label estimates as estimates.** Anything derived rather than fetched
  live (modeled options Greeks, AI chart reads) should say so in the text
  that reaches the member — this app is educational content, not a
  brokerage feed, and the UI copy throughout treats it that way.
