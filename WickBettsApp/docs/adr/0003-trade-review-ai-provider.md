# 0003: Review My Trade — OpenAI vision, base64 image storage, rolling weekly quota

## Status

Accepted. Superseded an earlier same-session choice of Anthropic/Claude —
see "History" below.

## Context

Subscribers wanted a way to drop a chart screenshot + their trade
description + stated bias into the Community tab and get an instant AI
read: what the chart shows, whether it agrees with their stated bias, and
a risk/invalidation note.

## Decisions

### Fully automated, no admin review gate

Unlike the signal scanner (ADR 0002), this feature posts the AI's response
immediately with no human in the loop. This was an explicit product
choice: the whole point is "not a hassle," and the content here is framed
as one member's own educational trade breakdown, not the app publishing an
endorsed call. The trust model is intentionally different from signals.

### AI provider: OpenAI, not Anthropic

**History:** this was originally built against Claude's vision API via raw
`fetch` (no live options-chain-style liability concern, and Claude was the
first suggestion). It was switched to OpenAI mid-session at the user's
request, for two concrete reasons:

1. `openai` (`^7.4.0`) was already a dependency — used by
   `routes/admin.ts`'s screenshot-to-signal-fields feature. Reusing it
   keeps the app on one AI vendor relationship instead of two, and avoids
   adding `@anthropic-ai/sdk` as a new dependency (see ADR 0004 / the
   lockfile constraint noted throughout this codebase's service layer).
2. Consistency: the admin screenshot scanner and the member-facing trade
   reviewer now use the same provider, same lazy-init-on-missing-key
   pattern, same error shape.

`tradeReviewAI.ts` uses `openai.chat.completions.create` with
`gpt-4o`, one image + one structured-JSON-output prompt, no streaming.
Model is overridable via `OPENAI_TRADE_REVIEW_MODEL` without a code
change.

### Image storage: base64 in Postgres, not object storage

`trade_reviews.image_data_url` stores the full `data:image/...;base64,...`
string directly in the row. This avoids standing up new storage
infrastructure (S3/R2/Cloudflare Images) and new credentials for a first
version of the feature — the same reasoning as the admin screenshot
scanner, which already sends images as base64 JSON payloads.

**Known trade-off:** this will bloat the `trade_reviews` table
significantly at scale (a compressed screenshot easily runs several
hundred KB to a couple MB as base64). Acceptable at current volume. If
this room gets heavy usage, migrate to object storage (store a URL instead
of the data URL) rather than continuing to grow Postgres row size
indefinitely — that migration was deliberately deferred, not overlooked.

### Quota: 4 free per rolling 7-day window, then $2.50/review via Stripe

Enforced by counting the member's own `trade_reviews` rows created within
the last 7 days (`routes/tradeReviews.ts`'s `getUsage()`), not a separate
counter column that would need a reset job. A rolling window was chosen
over a calendar week specifically because it needs no cron/reset
mechanism and self-corrects — the alternative (a `usedThisCalendarWeek`
counter zeroed by a scheduled job) is more moving parts for the same
member-facing behavior.

Paid overage is a flat $2.50 one-time Stripe Checkout
(`mode: "payment"`, not `"subscription"`) using inline `price_data` rather
than a pre-created Stripe Price/Product ID — the amount is fixed and
doesn't need catalog management, so this avoids requiring ops to create
and configure yet another `STRIPE_PRICE_*` env var. `checkout.session.completed`
webhook events with `metadata.type === "trade_review_credit"` increment
`users.extra_trade_review_credits`, consumed (free-first, then credits)
by the POST route. Admins are exempt from the quota entirely (moderation/
testing, not the paid perk).

**Known limitation:** quota/credit checks are not wrapped in a database
transaction or row lock. Two simultaneous submissions from the same
account could both pass the "do I have quota" check before either
decrements, resulting in a soft one-review overage. This mirrors the rest
of this codebase's style (no transactions used anywhere else either) and
was accepted as a minor, self-limited edge case rather than introducing
the first transactional code path in the app for it.

## Consequences

- Adding this feature required zero new npm dependencies, keeping
  `pnpm install --frozen-lockfile` (the Docker build's install step) safe
  against a lockfile mismatch that would otherwise fail every deploy.
- `OPENAI_API_KEY` must be set in Railway for this feature (and the
  pre-existing admin screenshot scanner) to work — as of this writing it
  is NOT set in production, so both features currently return a clean
  "not configured" error rather than crashing until that's added.
- The $2.50 price is hardcoded (`TRADE_REVIEW_CREDIT_PRICE_CENTS` in
  `routes/stripe.ts`) rather than configurable via env var, matching the
  "fixed amount, no catalog" reasoning above. Changing the price requires
  a code change and redeploy, not a dashboard/env var edit.
