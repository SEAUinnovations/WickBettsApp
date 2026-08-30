# 0011: Fraud guardrail verification + security audit — findings and fixes

## Status

Accepted.

## Context

A request to "make sure all fraud guardrails are in place and clean up all
vulnerabilities if any" prompted a pass over the referral program's fraud
guardrails and a broader review of `artifacts/api-server`'s authentication,
authorization, and injection surface — the areas not already covered by
`docs/adr/0004-security-hardening.md`.

## Referral fraud guardrails: verified intact, no new gaps

Every guardrail documented in `docs/adr/0010-referral-program.md` was
re-read against the current code and confirmed correctly implemented:
first-subscription-only conversion (`maybeRecordReferralConversion`), the
unique `referrals.referredUserId` constraint preventing double-counting,
the per-referrer daily volume limit that holds a referral at
`fraudFlag: true` for the admin queue instead of auto-crediting it, the
7-day hold before a credit is actually issued, refund/dispute clawback via
`clawBackReferralIfAny`, the referral cap correctly gating the permanent
Ambassador tier, and self-referral rejected at the one place it could
otherwise slip through (`POST /api/referrals/attribute`, the Google OAuth
path). The one gap called out in 0010 as deliberately not built — a
payment-method/card-fingerprint check to catch someone referring a second
email address they also control — remains unbuilt and is unchanged by this
pass; it's still the single highest-value fraud check left on the table if
this becomes a priority later.

## Vulnerabilities found and fixed

**1. Dev-auth bypass trusted spoofable request headers.**
`middlewares/requireAuth.ts`'s `isLocalRequest` decided whether a request
"looked local" (and could therefore skip real Clerk authentication) by
checking the `Host` and `Origin` headers for the substring "localhost" or
"127.0.0.1" — both of which are set entirely by the client and trivially
spoofable in a raw HTTP request to a public server. The bypass itself is
also gated on `DEV_AUTH_MODE`/`AUTH_BYPASS_MODE` being explicitly set and
`NODE_ENV !== "production"`, and neither is set on the production
`WickBettsAPP` Railway service today, so this was not actively exploitable
in production as found — but it's a real, latent full-authentication-bypass
(potentially escalating to admin, depending on `DEV_AUTH_ROLE`/
`DEV_AUTH_EMAIL`) that would activate the moment anyone ever set
`DEV_AUTH_MODE=dev` on any reachable deployment (a staging environment spun
up for QA, for instance) without separately locking down network access to
it. Fixed to check `req.ip` / the actual socket address instead, which —
given `trust proxy: 1` is already set correctly in `app.ts` per 0004 —
reflects the address Railway's edge actually saw the connection come from
and cannot be forged by adding request headers. Also set `NODE_ENV=production`
on the live Railway service, which wasn't set at all before this pass; this
is the primary gate on the bypass and is good practice independent of it.

**2. Community's subscription paywall was defined but never applied.**
`routes/community.ts` declared its own `requireActiveSubscription`
middleware — identical in shape to the one already enforced in
`signals.ts` and referenced by name in `tradeReviews.ts`'s own copy
("Same subscription gate used by community.ts and signals.ts") — but no
route in the file actually used it. Every route was gated by `requireAuth`
alone, meaning any signed-up account, with no subscription at all, had full
read and write access to Community Chat, Shared Signals (posting, editing,
following), and reactions: content documented and badged in the app as a
"Members only" paid perk. This wasn't a data-exposure bug (nothing
account-specific leaked to the wrong user), but it was a real monetization
gap — the exact protection this codebase already applies everywhere else
was simply missing here. Fixed by applying `requireActiveSubscription` to
`GET /`, `POST /:postId/react`, `POST /`, `GET /signals`, `POST /signals`,
and `POST /follow/:userId`. `PATCH`/`DELETE /signals/:id` were deliberately
left ownership-gated only (author or admin) rather than also
subscription-gated, so a member whose subscription lapses can still manage
or delete their own past posts — they just can't read the feed or create
new ones without an active subscription.

## Reviewed and confirmed clean — no changes needed

- **Stripe webhook** (`routes/stripe.ts`): verifies `stripe-signature`
  against the raw request body and `STRIPE_WEBHOOK_SECRET` via
  `stripe.webhooks.constructEvent`, and fails closed (400) on a bad
  signature before any event is trusted.
- **IDOR / cross-account access**: every route touching a specific
  member's data (`admin.ts`, `auth.ts`, `stripe.ts`, `mentorship.ts`,
  `support.ts`, `watchlist.ts`, `community.ts`) either scopes its query to
  `req.dbUser.id` directly or does an explicit ownership check
  (`row.authorId !== user.id && user.role !== "admin"`) before allowing a
  mutation. No route was found that lets one member read or modify
  another's data by supplying their ID.
- **SQL injection**: reconfirmed clean, as previously found in 0004 —
  every query goes through Drizzle's parameterized query builder.
- **Secrets in source**: no hardcoded API keys, passwords, or tokens found
  in the reviewed files; `.env` is correctly listed in
  `artifacts/api-server/.gitignore` and was never found staged for commit.
- **CORS, rate limiting, security headers, body size limits**: all
  reconfirmed intact exactly as fixed in 0004 — no regression found.

## Not done in this pass, and why

- **Dependency CVE scan**: this session has no path to run `pnpm audit` or
  `npm audit` — the cloud sandbox used for this review has no npm registry
  access, and the device shell on the machine this repo lives on was
  unavailable for the duration of this pass. Package versions were
  eyeballed for anything obviously stale, but that is not a substitute for
  an actual audit. Recommended follow-up: run `pnpm audit` from a real dev
  environment.
- **Cloudflare in front of the API domain**: still an open recommendation
  carried over from 0004 — the web frontend already sits behind Cloudflare,
  the API domain does not. This is a DNS/dashboard change, not something
  fixable from application code.
