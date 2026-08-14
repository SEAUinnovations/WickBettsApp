# 0009: Automated LEAPS / Buy & Hold signal generation

## Status

Accepted. Supersedes the scoping decision in ADR-adjacent discussion around
0004 (signal style) that LEAPS/Buy & Hold would be manual-admin-only.

## Context

The `style` column (Swing/Buy & Hold/LEAPS — see the signal-style schema
work) was originally scoped as manual-only: admins could pick a style in the
signal studio, but `signalScanner.ts`'s `buildStockOptionSignal` and
`buildCryptoSpotSignal` never set the field, so every auto-generated signal
silently defaulted to `"Swing"` at the DB level. The ask was to change that —
LEAPS, Buy & Hold, and crypto signals should come out of the same automated
pipeline that already produces the short-dated stock options plays, not be
gated behind manual admin entry.

## Decision

**Style is now chosen automatically per candidate, via `pickStyle()`,**
reusing two fields `technicalAnalysis.ts` already computes rather than
adding a new indicator:

- `trendAligned === false` or `null` (counter-trend or trend-agnostic
  setup) → **Swing**. Unchanged behavior — a short-dated timing play, 7-14
  DTE options for stocks, a daily spot call for crypto.
- `trendAligned === true` and `strictMatch === true` (stocks) → **LEAPS**.
  Real conviction plus a clean technical trigger justifies locking in a
  longer-dated contract instead of timing a 1-2 week bounce.
- `trendAligned === true` and `strictMatch === false` (stocks), or any
  `trendAligned === true` crypto candidate → **Buy & Hold**. Conviction in
  the direction, but not a precise enough trigger to time an options entry
  (stocks) or no options market to time in the first place (crypto) — a
  long-term spot position fits better than either a swing trade or a LEAPS
  contract.

**LEAPS expiration** scales with how extreme the RSI reading is
(`leapsMonthsOut`): deeply oversold/overbought → 12 months, oversold/
overbought → 8 months, approaching → 6 months — always clamped to at least
180 days out. `pickExpiration` (existing helper, previously only ever
called with a 7-14 day window) is reused with this wider window to land on
the nearest Friday.

**LEAPS/Buy & Hold target and stop** extrapolate the same near-term
support/resistance move the Swing/spot builders already use, but 3x
further out — a multi-month thesis should be sized against a bigger
expected move than a 1-2 week swing, not the exact same near-term level.
LEAPS widens its stop buffer from 1.5%/1.015x to 5%/1.05x (more room before
a longer-duration thesis is invalidated); Buy & Hold has no stop at all
(`stop: null` — the column was already made nullable for this style).

**New builder, `buildStockBuyHoldSignal`.** Buy & Hold stock signals are not
an options play (`isOption: false`, matching the LEAPS/Swing ↔
`isOption: true` and Buy & Hold ↔ `isOption: false` invariant the manual
admin routes already enforce in `routes/signals.ts`), so they can't reuse
`buildStockOptionSignal` — they're built the same way `buildCryptoSpotSignal`
builds a crypto spot position, just for stocks.

**`buildCryptoSpotSignal`** now takes a `style` parameter (`"Swing" |
"Buy & Hold"` — crypto never gets `"LEAPS"`, there's no crypto options
builder in this app) and branches the same way: Buy & Hold drops the stop
and widens the target, Swing is unchanged.

**Thesis text** gets a short appended sentence on LEAPS/Buy & Hold signals
explaining the longer horizon and lack of a hard stop — phrased the same
neutral way the rest of `buildAnalysisText` is (no mention that this is
scanner/automation-driven, consistent with the earlier decision to strip
automation disclosure from member-facing text).

## Consequences

- A run can now insert a mix of styles instead of always Swing — the
  existing `MAX_SIGNALS_PER_RUN = 2` cap and dedup-by-recent-asset logic are
  unchanged, so this doesn't increase how many signals land per run, only
  what style the chosen ones come in as.
- Every auto-generated record now sets `style` explicitly instead of
  relying on the DB column default. The default (`"Swing"`) stays in place
  as a safety net for any other insert path, but is no longer load-bearing
  for the scanner.
- Manual admin signal creation is untouched — an admin can still pick any
  style by hand regardless of what `pickStyle()` would have chosen for a
  similar setup; this only changes what the automated pipeline does on its
  own.
- Mobile UI required no changes: `admin.tsx`'s style badges/filters and
  `signals.tsx`'s member-facing style badge, optional-stop rendering, and
  "No hard stop" note were already built generically off the `style`/`stop`
  fields (from the manual-only version of this feature) and apply
  unchanged to auto-generated LEAPS/Buy & Hold signals.
