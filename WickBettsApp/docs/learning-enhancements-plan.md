# Learning workflow enhancements — plan

## Status

Proposed. This is a planning document only — no code has been written against
it. It covers three requested additions to the Learning tab: (1) interactive
chart-pattern-recognition training on real historical snapshots, (2) a new
Strategies curriculum (FVG, scalping, ORB, support & resistance), and (3) a
gamified risk-management / portfolio-sizing module covering prop firm vs.
live account vs. options.

## What exists today

The Learning tab (`app/learning/index.tsx`) is a level-gated module list
(Beginner → Expert) backed entirely by static content in `lib/learningData.ts`
plus per-device progress in `lib/learningStorage.ts` — XP, level, a daily
streak counter, and per-module completion flags. **Progress is local-only
today** (the screen's own footnote says so); there's no server-side sync, no
cross-device state, and no leaderboard.

Five module types exist, all built on synthetic (not real market) data:

- `lesson.tsx` renders rich static content — paragraphs, callouts, scenario
  blocks, a "candles" block using a small `CandleGlyph` decorative component.
- `candle-arcade.tsx` and `trivia-arena.tsx` are 8-round multiple-choice
  quizzes with score/streak tracking and immediate feedback.
- `trade-bias-simulator.tsx` shows a mock pattern glyph and asks the player
  to call BUY/SELL.
- `options-strike-lab.tsx` shows a goal and three strike cards with
  fabricated Greeks; the player picks the strike matching the goal.
- `funded-combine-prep.tsx` is the closest existing analog to what's being
  asked for in part 3: it runs a single prop-firm evaluation with a real
  drawdown-floor mechanic (`peakEquity − FUNDED_MAX_DRAWDOWN`), a day-by-day
  loop where the player picks a risk tier (conservative/moderate/aggressive)
  sized against the current cushion, and ends in funded / blown / out-of-days.
  It has no account-type choice and no cash/options allocation concept —
  it's worth extending rather than replacing.

On the data side: `services/marketHistory.ts` can fetch real daily OHLCV for
any tracked stock/ETF (Nasdaq's historical endpoint, arbitrary date range) and
daily crypto bars from CoinGecko (open=high=low=close there — no real wicks).
`services/intradayData.ts` can fetch real sub-daily bars, but only a shallow
window — Yahoo's undocumented chart endpoint caps out around 5–10 days of
5-minute/hourly data — and includes a `resampleTo4Hour()` helper that's
already used elsewhere for the day-trade scanner. `services/technicalAnalysis.ts`
computes RSI, rolling support/resistance, volatility, SMA20/50, and
single/dual-candle engulfing detection, plus one composite break-of-structure
setup — there is no multi-swing pattern detection (head & shoulders, double
tops, triangles) anywhere in the codebase today. None of this is wired to a
route the mobile app can call for historical charts: `routes/market.ts`
exposes only live quotes and a ticker directory, nothing historical.

Two constraints matter for everything below: there is no charting library in
the mobile app yet (only base `react-native-svg`, plus
`react-native-gesture-handler` and `react-native-reanimated`, which are
exactly the primitives a draw-on-chart feature needs), and real 4-hour
history deep enough for "random point in time" training doesn't exist in the
current data pipeline — daily bars go back further, 4-hour bars currently
don't.

## Part 1 — Chart pattern recognition training

### Content strategy: curated first, algorithmic later

Building a real "any random historical point in time, auto-detect whether a
head-and-shoulders is present" engine is a hard, error-prone problem —
classic chart patterns are notoriously subjective even among professional
technicians, and an algorithm that mislabels a pattern teaches the wrong
lesson with total confidence. Recommend shipping in two phases instead:

- **Phase A — curated snapshot library.** Hand-pick a real, historical set
  of chart segments (roughly 40–80 to start) that show confirmed instances of
  each target pattern — head & shoulders, double top/bottom, ascending/
  descending/symmetrical triangles, bull/bear flags, cup & handle, rising/
  falling wedge — on both 4hr and daily timeframes, across a mix of the
  tickers already tracked in `market.ts`. Each snapshot is stored as a plain
  OHLC array plus the ground-truth annotation geometry (the neckline's two
  points, the pattern's boundary points) and a short explanation of why it
  qualifies. This sidesteps the data-depth problem entirely — the daily-bar
  history already available is enough to hand-pick these — and guarantees
  every training example is pedagogically sound.
- **Phase B — algorithmic random sampling.** Once the curated library has
  proven the UX and the scoring model, expand to pulling a real random
  window from a ticker's real history and running a permissive
  pattern-candidate detector (extending `technicalAnalysis.ts`) to flag
  *candidate* windows for a human (admin) to approve into the library, rather
  than auto-serving unverified detections straight to learners. This still
  needs deeper historical 4-hour data than `intradayData.ts` currently
  provides — see the open question below.

### The annotation/drawing engine

This is the one genuinely new piece of mobile infrastructure the whole plan
depends on, and it's shared by parts 1 and 2 below, so it's worth building
once and well: a candlestick renderer built on `react-native-svg` (rendering
OHLC bars is straightforward SVG — rects and lines against a computed
price/time scale) with a gesture layer on top using
`react-native-gesture-handler` for the actual drawing — circling a region,
dragging a line for a neckline, drawing a horizontal ray for a support/
resistance level, or boxing an opening range. Each user annotation is stored
as geometry (points, not a raster image), which is what makes scoring
possible: the app compares the user's drawn neckline/boundary against the
snapshot's stored ground-truth geometry (distance/slope tolerance rather than
exact-match) and gives full/partial/no credit with an explanation either way.
Since this needs a new dependency-free build on primitives already in the
app, it avoids the new-npm-dependency risk called out elsewhere in this
codebase's own docs (`docs/adr/0005`) — no charting library needs to be
added. If a richer charting library is added instead of building this by
hand, verify its React Native / Expo build compatibility and lockfile impact
in a real dev environment first, the same way the API server's dependency
policy already requires.

### Sniper-entry simulation

Once a pattern is confirmed (either by the curated library or by the
player's own correct annotation), layer a second round on the same chart:
reveal a few more bars of "future" price action and ask the player to place
an entry, stop, and target consistent with the pattern's textbook trade plan
(e.g., neckline break + retest for H&S, breakout of the triangle apex).
Score against a rules-based ideal zone rather than a single "correct" price,
the same tolerance-band approach as the annotation scoring, and follow it
with a short explanation of what a strong vs. weak entry looked like and
why — mirroring the immediate-feedback pattern already used successfully in
`candle-arcade.tsx`.

### Backend additions needed

A new `pattern_snapshots` table (id, timeframe, ticker, OHLC payload,
pattern type, ground-truth annotation geometry, explanation text, difficulty)
and a lightweight admin curation route mirroring the existing
`news.ts`/`admin.ts` override pattern, so new snapshots can be added or
corrected without an app release. A read endpoint for the mobile app to pull
a random (or difficulty-filtered) snapshot. No changes needed to the
existing market-data services beyond what Phase B eventually requires.

## Part 2 — Strategies curriculum

Fair Value Gaps, scalping, Opening Range Breakout, and support & resistance
are mostly a content-authoring effort, not a new-technology effort — they sit
naturally on the existing `lesson.tsx` renderer, which already supports the
scenario/definition/callout content blocks this needs. Recommend three
strategies beyond the ones named, since they round out a "popular strategies"
curriculum and reuse the exact same drawing engine: VWAP reversion, trendline
breaks, and liquidity sweeps/stop hunts.

Each strategy gets the same three-part shape for consistency and so the
production cost per strategy is predictable:

1. A lesson (concept, when it works, when it fails, common mistakes) using
   the existing rich-content renderer.
2. A drawing drill reusing part 1's annotation engine — mark the FVG (a
   three-candle gap), box the opening range and its breakout level, draw the
   support/resistance zone, mark the VWAP reversion entry, and so on. This is
   where the shared engine pays for itself twice.
3. An 8-round arcade quiz in the proven `candle-arcade.tsx` format, testing
   recognition speed rather than drawing precision, for players who want a
   faster loop or a way to drill after finishing the full drawing lesson.

## Part 3 — Gamified risk management & portfolio sizing

### Extend, don't replace, the funded-combine game

`funded-combine-prep.tsx` already has the core loop right (day-by-day
decisions against a real drawdown mechanic, resolved with randomness, ending
in a clear pass/fail). Recommend adding an account-type selection screen in
front of it that branches into three tracks sharing the same engine:

- **Prop firm evaluation** — the existing drawdown-floor, profit-target,
  consistency-rule mechanic, unchanged.
- **Live personal account** — same day-by-day loop, but swaps the hard
  drawdown-breach failure for a running "would a real broker have margin-
  called you" check, and adds a compounding/tax-drag lesson layer prop firm
  accounts don't have (a prop account's profit split isn't the same as
  keeping 100% of gains in a personal account, and short-term trading gains
  are taxed differently than long-term holds — both worth teaching here).
- **Options-focused portfolio** — a different objective entirely: instead of
  one position at a time, the player manages an allocation across cash and
  options positions across the sim's day-by-day loop, which leads into the
  portfolio-allocation game below.

### Portfolio allocation builder

A new mini-game, not an extension of funded-combine-prep: give the player a
starting amount, then let them build a cash/options/long-term-holds split
with sliders, offering a few named preset strategies as starting points —
for example a cash-heavy 80/20 split, a balanced 60/40 split, and a
three-way 40% cash / 20% long-term holds / 40% options split — each labeled
with the risk/reward tradeoff it represents (more cash = more dry powder and
less blow-up risk, more options = more leverage and more decay/expiration
risk). Score the choice against a simulated volatility scenario (a calm
month, a crash month, a rally month) so the same allocation visibly performs
differently depending on what the market actually does — the pedagogical
point being that there's no single right split, only tradeoffs, which the
game should say explicitly rather than implying one preset is "correct."

### Risk-sizing duel

**One thing in the original request needs a flag before this gets built.**
"If you have $1,000, you only want to risk 20–30% per trade" describes a
risk level far above what's normally meant by "risk per trade" in trading
education — the standard convention (and what most funded-account rules,
including the one already modeled in `funded-combine-prep.tsx`, actually
enforce) is risking roughly 1–2% of account equity on a single trade's
stop-loss, with even aggressive discretionary traders rarely exceeding 5%,
because a 20–30%-per-trade risk budget means two or three losing trades in a
row can end the account. It's likely the 20–30% figure describes something
different — the amount of *buying power or capital allocated* to a single
position (which absolutely can run 20–30%+ depending on leverage and how
tight the stop is) rather than the amount actually *at risk* if the stop is
hit. Recommend the game teach this distinction explicitly rather than
building a mechanic that tells users 20–30% per-trade risk is the target,
since that would be actively incorrect risk-management guidance coming from
inside an educational product. Concretely: a "Risk Sizing Duel" round-based
sim where the player picks a stop-loss-based risk percentage (a slider
realistically bounded around 0.5–10%) and a position-sizing percentage
(capital allocated, which can run much higher) as two separate numbers, then
runs a sequence of trades at a fixed win rate to show — visually, via the
account curve — how a too-high risk-per-trade number compounds into ruin
over a losing streak, while a too-low one just makes small, safe, boring
progress. This teaches the real mechanism (risk of ruin) rather than handing
over a static rule to memorize.

## Making all of this feel like a game, not homework

A few cross-cutting UX principles worth holding to across every module
above, since the ask was explicitly for something fun and interactive, not
another quiz bank:

Keep every drawing/annotation interaction snappy with haptic feedback on
a correct placement (the existing modules already lean on
`expo-haptics` for this — extend the pattern rather than introducing a new
one). Layer in short between-round transitions and a running score/combo
counter the way `candle-arcade.tsx` already does, since that loop is proven
to work in this app. Unlock new pattern difficulty tiers and new strategies
as XP milestones are hit rather than exposing everything at once, so the
curriculum has a sense of progression instead of being a flat menu.
Consider light badge/achievement state (first perfect neckline draw, first
funded-track pass, etc.) even before full cross-device sync exists — it can
start as local state exactly like today's XP/streak system and get promoted
to server-synced later without changing the UX.

## Backend/infra summary

New work needed beyond the mobile UI: a `pattern_snapshots` table and its
admin curation route (Part 1); no schema changes needed for Part 2 beyond
new static lesson content; for Part 3, if badges/leaderboards should be
cross-device rather than local-only, that's a new `learning_progress` table
and a couple of routes following the same auth/ownership pattern used
everywhere else in this API. None of this touches the existing subscription
gate, referral system, or any other part of the app — Learning currently
isn't behind `requireActiveSubscription` the way Community/Signals/News are
(worth confirming that's intentional, since it's inconsistent with how every
other paid feature in the app is gated — see the open question below).

## Suggested sequencing

1. Build the shared SVG annotation/drawing engine — it's the one piece
   everything else depends on, and validating it early (even against a
   single hand-picked pattern) de-risks the rest of the plan.
2. Ship the curated pattern-snapshot library (Phase A) plus the sniper-entry
   simulation on top of it — this is the highest-novelty, most-requested
   piece and doesn't require any new data infrastructure.
3. Ship the Strategies curriculum, reusing the drawing engine from step 1 —
   this is mostly content production once the engine exists.
4. Ship the account-type tracks and portfolio allocation builder, extending
   `funded-combine-prep.tsx`.
5. Ship the risk-sizing duel with the corrected risk-vs-allocation framing.
6. Revisit Phase B (algorithmic pattern sampling) only once the curated
   version has real usage data on which pattern types and difficulty levels
   actually engage learners.

## Open questions to resolve before building

Should Learning require an active subscription like the rest of the app, or
stay free as an acquisition funnel — this affects whether new Learning
content should route through `requireActiveSubscription` the way Community
and News already do. Is cross-device progress (needed for any real
leaderboard) worth the new backend work now, or should badges stay local for
this round the way XP/streaks already are. For Phase B's algorithmic
sampling, is it worth paying for a historical intraday data provider (e.g.
one offering multi-year hourly/4-hour bars) to get real depth beyond what
free sources like Yahoo's undocumented endpoint provide, or is the curated
library sufficient for the foreseeable future. And finally, confirming the
20–30%-per-trade figure's intended meaning (risk vs. allocation) before any
copy referencing it ships, per the flag raised in Part 3.
