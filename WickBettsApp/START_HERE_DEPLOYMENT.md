Start Here: Cloudflare Pages + Railway API cutover

Phase A: Railway API setup

1. Create a Railway project.
2. Add one API service from this repo root.
3. Confirm Railway picks up railway.json.
4. Add a Railway Postgres database.
5. Add variables from ops/railway.production.env.template.
6. Set `DATABASE_URL` to `${{ Postgres.DATABASE_PRIVATE_URL }}`.
7. Set `APP_ORIGIN=https://wickbetts.com` and `CORS_ALLOWED_ORIGINS=https://wickbetts.com`.

Phase B: Frontend deploy automation

1. In GitHub repo settings, add secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_PAGES_PROJECT_NAME`
   - `CLERK_PUBLISHABLE_KEY` (or `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`)
   - `EXPO_PUBLIC_API_URL` (recommended production value: `https://wickbetts.com`)
2. Optional GitHub variables fallback supported by workflows:
   - `CLERK_PUBLISHABLE_KEY` or `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `EXPO_PUBLIC_API_URL`
3. Confirm workflow `.github/workflows/deploy-cloudflare-pages.yml` is present on `main`.
4. Push to `main` and verify Pages production deploy succeeds.

Phase B.1: Backend CI test coverage

1. Confirm workflow `.github/workflows/backend-test.yml` is present on `main`.
2. Add auth/runtime test secrets (or variables) for CI:
   - `CLERK_SECRET_KEY`
   - `SESSION_SECRET`
3. Push to `main` and verify backend smoke tests pass.

Phase C: Cloudflare Pages + DNS

1. Create/attach Pages project to this repository.
2. Set custom domain `wickbetts.com`.
3. Optionally add `www.wickbetts.com` and redirect to apex.
4. Ensure Pages worker is deployed from `artifacts/wick-betts/public/_worker.js`.
5. Verify `https://wickbetts.com/healthz` and `https://wickbetts.com/api/healthz`.

Phase D: External integrations

1. Clerk allowed URLs:
   - https://wickbetts.com
   - https://wickbetts.com/sign-in
   - https://wickbetts.com/sign-up
2. Stripe webhook endpoint:
   - https://wickbetts.com/api/stripe/webhook
3. Mobile EAS value:
   - EXPO_PUBLIC_API_URL=https://wickbetts.com

Phase E: Final smoke test

1. Web sign-in/sign-up.
2. Mobile sign-in.
3. Authenticated /api/auth/me from web and mobile.
4. Stripe checkout and return.
5. Subscription state update via webhook.

Reference runbook: DEPLOY_RAILWAY_CLOUDFLARE.md
