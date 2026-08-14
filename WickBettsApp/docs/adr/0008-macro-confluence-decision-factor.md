# 0008: Cross-asset macro confluence (VIX/Dollar/Gold/Bonds) + rate-decision awareness as a scanner decision factor

## Status

Accepted.

## Context

The automated signal scanner (`signalScanner.ts`) picked candidates purely
on a per-symbol technical screen (RSI + support/resistance + volume — see
`technicalAnalysis.ts`). It had no cross-asset macro awareness at all, and
its only interest-rate awareness was `economicCalendar.ts`'s FOMC-date
proximity, which fed a "keep in mind" star on already-chosen signals but
never influenced *which* candidates got chosen in the first place. The ask
was to bring VIX, Dollar, Gold, and Bonds correlation in as a confluence
factor, and to make rate decisions an actual input to signal selection, not
just a downstream flag.

## Decision

**New service, `macroConfluence.ts`.** Tracks four liquid, US-listed ETFs
through the exact same Nasdaq quote/historical API the rest of the scanner
already uses — no new data source, no API key:

- `VIXY` (VIX Short-Term Futures ETF) as the VIX proxy — true spot VIX
  isn't reachable through the same code path as everything else, and VIXY
  reuses the already-proven `assetclass=etf` fetch rather than gambling on
  an untested `assetclass=index` branch.
- `UUP` (Dollar Index Bullish Fund) as the Dollar proxy — DXY itself is
  ICE-listed and not Nasdaq-quotable.
- `GLD` and `TLT` — already tracked elsewhere in the app for the dashboard
  heatmap.

Each leg's ~10-session % change is classified up/down/flat against a
per-instrument threshold (VIXY moves far more than UUP in normal
conditions, so thresholds aren't uniform), then combined into a regime —
Risk-On, Risk-Off, or Mixed — using the standard cross-asset heuristic:
risk-on is VIX falling + Dollar weakening + Gold cooling + bonds selling
off (yields rising, capital rotating into risk assets); risk-off is the
mirror image. All four legs share the same up=risk-off/down=risk-on
polarity, which is why the scoring code doesn't need per-instrument sign
flips. Result is cached 15 minutes (one read shared across a whole scan
run, not re-fetched per candidate).

**Interest rates specifically:** there's no live Fed funds rate or
dot-plot feed wired into this app, so "keep an eye on interest rates" is
handled two ways rather than one: TLT's trend (already one of the four
confluence legs) stands in as the *market-implied* rate-direction signal —
bonds bid means yields falling means the market is pricing in cuts/dovish
tone, bonds sold off means the opposite. Separately, `economicCalendar.ts`
gained `fomcWithinRange()`, a synchronous (no-network) export of logic that
already existed privately in that file, so the scanner can now check "does
this candidate's holding window contain an FOMC decision" for every
candidate during ranking — cheaply, since FOMC dates are the same for every
symbol, unlike earnings — rather than only for the couple of candidates
that end up chosen.

**How it changes selection.** `signalScanner.ts` computes a `rankScore` per
candidate = the existing pure technical `screen.score`, adjusted by:
- ±1.5 if the confluence regime agrees/disagrees with the candidate's
  direction (Risk-On favors Long, Risk-Off favors Short) — modest relative
  to typical technical scores (RSI gap alone can run into the teens), so it
  tips close calls between similar setups rather than overriding a strongly
  qualified technical signal.
- −1 flat penalty (non-directional) if an FOMC decision falls inside the
  candidate's expected holding window — a rate decision adds uncertainty
  regardless of which way the trade is positioned.

`screen.score` itself is never mutated — `technicalAnalysis.ts` stays a
pure, network-free, unit-testable module exactly as documented in its own
header. The macro/rate adjustment lives entirely in `signalScanner.ts`'s
ranking step.

**Thesis text.** `buildAnalysisText()` now appends a `Cross-asset read: ...`
sentence (which legs moved, the resulting regime, and whether that backdrop
supports or runs counter to the specific trade's direction) and, when
applicable, a sentence flagging that a Fed decision falls inside the
window. This is layered onto every published auto-generated signal's
"Wick's Read," alongside the existing RSI/trend narrative.

**Not done:** manual admin-authored signals (the signal studio in
`admin.tsx`) don't get an automatic confluence read — the ask was
specifically about "signals code" (the automated decision logic), and an
admin publishing by hand already exercises their own discretion.

## Consequences

- If Nasdaq's historical endpoint doesn't actually accept
  `assetclass=etf` cleanly for VIXY/UUP/GLD/TLT (untested against ETF
  symbols before this change — see the doc comment added to
  `fetchStockDailyBars` in `marketHistory.ts`), confluence legs degrade to
  `"unavailable"` individually rather than failing the whole read; a
  regime of all-unavailable legs computes as "Mixed" (net score 0), which
  applies no ranking adjustment — fails safe to "no macro opinion," not to
  a crash or a wrong opinion.
- VIXY as a VIX proxy carries known futures-roll/contango behavior that
  spot VIX doesn't — acceptable for a short-lookback directional read, not
  appropriate if this were ever extended into a longer-horizon macro model.
- The FOMC penalty is intentionally small and flat rather than an outright
  exclusion — a rate decision in the window doesn't disqualify an otherwise
  excellent technical setup, it just nudges the ranking when candidates are
  close.
- `routes/market.ts` now also tracks VIXY/UUP in the "macro" ticker group
  (same tickers macroConfluence.ts reads), so members can see the same
  instruments on the existing dashboard heatmap that a signal's thesis text
  now references by name.
