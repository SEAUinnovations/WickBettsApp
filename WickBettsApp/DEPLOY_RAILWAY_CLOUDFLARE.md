# Railway + Cloudflare Deployment (Single Domain)

This setup deploys one Railway service and exposes one public Cloudflare domain.

- Web app served at `/`
- API served at `/api/*`
- Health check at `/healthz`

## 1. Railway Project Bootstrap

1. Create a new Railway project.
2. Add one service from this repository.
3. Ensure Railway reads [railway.json](railway.json).
4. Provision a Railway Postgres database and attach it to the same project.

Build note:

- The Docker deployment path intentionally uses a Debian `bookworm-slim` Node image, not Alpine.
- The workspace pnpm overrides strip several `linux-x64-musl` native optional packages, so switching the image back to Alpine will break Vite/Rollup native module resolution during build.

## 2. Required Railway Variables

Set these service variables before first production start:

- `NODE_ENV=production`
- `PORT=8080` (or let Railway inject `PORT` if configured)
- `DATABASE_URL=${{ Postgres.DATABASE_PRIVATE_URL }}`
- `APP_ORIGIN=https://app.yourdomain.com`
- `CORS_ALLOWED_ORIGINS=https://app.yourdomain.com`
- `CORS_ALLOW_REPLIT_ORIGINS=false`
- `CLERK_PUBLISHABLE_KEY=<pk_live_or_pk_test>`
- `CLERK_SECRET_KEY=<sk_live_or_sk_test>`
- `SESSION_SECRET=<long-random-secret>`
- `STRIPE_SECRET_KEY=<stripe-secret>`
- `STRIPE_WEBHOOK_SECRET=<stripe-webhook-secret>`
- `STRIPE_PRICE_SIGNALS=<price_id>`
- `STRIPE_PRICE_MENTORSHIP=<price_id>`

Optional:

- `OPENAI_API_KEY=<key>`
- `WEB_DIST_DIR=<custom path>` (only if the default static bundle path is changed)

Database note:

- Use the Railway Postgres private-network reference shown in the Postgres connect dialog.
- Do not point this app at MySQL; the backend uses `pg` and `drizzle-orm/node-postgres`, so it requires a Postgres connection string.

## 3. Clerk and Stripe Console Updates

1. Clerk allowed origins/redirects:
- `https://app.yourdomain.com`
- `https://app.yourdomain.com/sign-in`
- `https://app.yourdomain.com/sign-up`

2. Stripe webhook endpoint:
- `https://app.yourdomain.com/api/stripe/webhook`

3. Stripe customer portal/checkouts use `APP_ORIGIN` for return URLs.

## 4. Cloudflare DNS

1. Create DNS `CNAME`:
- Name: `app`
- Target: your Railway service public hostname
- Proxy status: Proxied

2. Keep SSL/TLS mode at `Full` (or `Full (strict)` when certificate trust is finalized).

## 5. Cloudflare Caching + Routing Rules

Create a Cache Rule to bypass API responses:

- If: `http.request.uri.path starts_with "/api/"`
- Then: `Cache eligibility = Bypass`

Optional hardening:

- Disable Browser Integrity/Managed WAF rules only if they block Clerk/Stripe callbacks.

## 6. Mobile Production URL

Set in EAS profiles/environment:

- `EXPO_PUBLIC_API_URL=https://app.yourdomain.com`

## 7. Verification Checklist

1. `GET https://app.yourdomain.com/healthz` returns `200`.
2. `GET https://app.yourdomain.com/api/healthz` returns `200`.
3. Web landing page loads at `/`.
4. Web sign-in/up loads and completes with Clerk.
5. Authenticated `GET /api/auth/me` succeeds from web and mobile.
6. Stripe checkout opens and returns to web.
7. Stripe webhook receives events and updates subscription state.

## 8. Rollback

1. In Cloudflare DNS, switch `app` record target back to prior origin.
2. Purge Cloudflare cache for the app hostname.
3. Verify `/healthz` and `/api/healthz` on rolled-back origin.
