---
name: Auth and Stripe Architecture
description: How Google SSO, Stripe subscriptions, Express API, live market data, and news are wired together across web and mobile.
---

## Auth — Google OAuth via Passport.js (Express)

- Strategy: `passport-google-oauth20` with `proxy: true` and relative `callbackURL: "/api/auth/google/callback"`
- Sessions via `express-session` + `connect-pg-simple` (table: `sessions`, auto-created)
- Session cookie name: `wb.sid`, httpOnly, sameSite lax (dev) / none (prod)
- Auth routes: `GET /api/auth/google` → redirect, `GET /api/auth/google/callback` → session, `GET /api/auth/me` → user JSON, `POST /api/auth/logout`
- Web app uses `AuthContext` (artifacts/wick-betts/src/context/AuthContext.tsx) that fetches `/api/auth/me` on mount
- **Super-admin**: `bettstahlik@gmail.com` is always forced to `role: 'admin'` on every Google OAuth login
- **User must add** `https://{dev-domain}/api/auth/google/callback` to Google Cloud Console Authorized redirect URIs
- **GOOGLE_CLIENT_SECRET was pasted in chat** — user should rotate it from Google Cloud Console

## Stripe — Subscriptions + Apple Pay / Google Pay

- Stripe checkout sessions include `payment_method_types: ["card", "apple_pay", "google_pay", "link"]`
- Checkout routes: `POST /api/stripe/create-checkout` (returns session URL), `POST /api/stripe/create-portal` (billing portal), `POST /api/stripe/webhook`
- Webhook updates `subscriptionsTable` — requires `STRIPE_WEBHOOK_SECRET` and raw body capture middleware
- Gracefully returns 503 if `STRIPE_SECRET_KEY` is not set
- All five Stripe secrets are now configured: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_SIGNALS, STRIPE_PRICE_MENTORSHIP

## Market Data

- **NASDAQ public API** (no auth required): `https://api.nasdaq.com/api/quote/{symbol}/info?assetclass={etf|stocks}`
  - Returns `data.primaryData.lastSalePrice`, `netChange`, `percentageChange`, `volume`
  - Values are strings like "$773.03", "-0.03%", "-0.25" — parse with `parseMoney()` stripping `$,%,+,spaces`
  - Referer and Origin headers must be set to `https://www.nasdaq.com` or requests may fail
- **CoinGecko free API** (no auth): `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true`
  - Used for BTC-USD and ETH-USD only
- **Yahoo Finance v7 quote API is blocked** (returns Unauthorized) — do NOT use
- **Stooq.com is blocked** from Replit environment — do NOT use
- **Yahoo Finance chart API (v8)** — returns "Too Many Requests" — do NOT use
- Market data cached for 1 min server-side; 39 quotes total across indices, sectors, megacap, finance, crypto

## News Feed

- Sources: Yahoo Finance RSS, CNBC Markets RSS, WSJ Markets RSS — fetched server-side, parsed with `fast-xml-parser`
- `GET /api/news/feed` — cached 5 min, returns up to 40 deduplicated articles sorted newest-first
- Category auto-detected from headline keywords (Crypto, Macro, Earnings, Tech, Finance, Markets)

## Admin System

- `GET /api/admin/users` — list all users (admin only)
- `PATCH /api/admin/users/:id/role` — grant/revoke admin (cannot demote bettstahlik@gmail.com)
- Web admin portal at `/app/admin/signals` and `/app/admin/users` — gated by `user.role === 'admin'`
- Mobile admin screen shows Greek disclaimer and screenshot upload UI
- Admin Signal Studio link in Profile only visible when `user.role === 'admin'`

## Database

- Schema in `lib/db/src/schema/`: users.ts, subscriptions.ts, signals.ts
- api-server uses project references → must rebuild lib/db (`npx tsc -p tsconfig.json` in lib/db) before api-server typecheck
- Tables pushed to DB with `pnpm run push` in lib/db
- Signals API: `GET /api/signals` (requires auth + active sub), `POST /api/signals` (admin only), `PATCH /api/signals/:id`

**Why:** Use relative `/api/*` paths in frontend — never hardcode localhost or port numbers. NASDAQ API requires Referer/Origin headers.
