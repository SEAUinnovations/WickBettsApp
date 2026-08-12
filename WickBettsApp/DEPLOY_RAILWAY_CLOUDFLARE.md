# Cloudflare Pages + Railway API Deployment (wickbetts.com)

This setup hosts the web frontend on Cloudflare Pages and keeps the API on Railway.

- Frontend served by Pages at `/`
- API proxied through Pages Functions at `/api/*`
- Health check proxied at `/healthz`

## 1. Hosting model

1. Cloudflare Pages hosts `artifacts/wick-betts` output.
2. Railway runs only the API service.
3. Cloudflare Pages advanced mode worker (`public/_worker.js`) forwards `/api/*` and `/healthz` to Railway.
4. Canonical production host is `https://wickbetts.com`.

## 2. GitHub automation (every push)

This repo includes a workflow at `.github/workflows/deploy-cloudflare-pages.yml`.

On every push to `main`, it:

1. Installs workspace dependencies with pnpm.
2. Builds the web app with `PORT=3000 BASE_PATH=/`.
3. Deploys `artifacts/wick-betts/dist/public` to Cloudflare Pages.
4. Deploys a Pages worker from `artifacts/wick-betts/public/_worker.js` (copied into `dist/public/_worker.js` by Vite build).

Required GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PAGES_PROJECT_NAME`

## 3. Cloudflare Pages project settings

1. Connect Pages project to this repo.
2. Production branch: `main`.
3. Custom domain: `wickbetts.com`.
4. Add optional `www.wickbetts.com` and redirect `www -> apex`.

## 4. Railway API settings

Set these service variables:

- `NODE_ENV=production`
- `DATABASE_URL=${{ Postgres.DATABASE_PRIVATE_URL }}`
- `APP_ORIGIN=https://wickbetts.com`
- `CORS_ALLOWED_ORIGINS=https://wickbetts.com`
- `CORS_ALLOW_REPLIT_ORIGINS=false`
- `CLERK_PUBLISHABLE_KEY=<pk_live_or_pk_test>`
- `CLERK_SECRET_KEY=<sk_live_or_sk_test>`
- `SESSION_SECRET=<long-random-secret>`
- `STRIPE_SECRET_KEY=<stripe-secret>`
- `STRIPE_WEBHOOK_SECRET=<stripe-webhook-secret>`
- `STRIPE_PRICE_SIGNALS=<price_id>`
- `STRIPE_PRICE_MENTORSHIP=<price_id>`

Optional Pages Worker variable:

- `RAILWAY_API_ORIGIN=https://wickbettsapp-production.up.railway.app`

If `RAILWAY_API_ORIGIN` is not set in Pages, the worker uses that same default.

## 5. Clerk and Stripe domain alignment

Clerk allowed URLs:

- `https://wickbetts.com`
- `https://wickbetts.com/sign-in`
- `https://wickbetts.com/sign-up`

Stripe webhook endpoint:

- `https://wickbetts.com/api/stripe/webhook`

## 6. Mobile production URL

Set in EAS:

- `EXPO_PUBLIC_API_URL=https://wickbetts.com`

## 7. Verification checklist

1. Push any commit to `main`; confirm workflow deploy succeeds.
2. `GET https://wickbetts.com/healthz` returns `200`.
3. `GET https://wickbetts.com/api/healthz` returns `200`.
4. Web sign-in/sign-up flow works on apex domain.
5. Authenticated `GET /api/auth/me` succeeds from web and mobile.
6. Stripe checkout and webhook flow still work.

## 8. Rollback

1. In Pages, redeploy prior successful build.
2. If needed, point apex DNS back to prior origin.
3. Verify `/healthz` and `/api/healthz` after rollback.
