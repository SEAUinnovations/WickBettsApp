Start Here: Railway + Cloudflare cutover

Phase A: Railway project setup

1. Create a Railway project.
2. Add one service from this repo root.
3. Confirm Railway picks up railway.json.
4. Add a Railway Postgres database.
5. Add variables from ops/railway.production.env.template.
6. Set `DATABASE_URL` in the app service to `${{ Postgres.DATABASE_PRIVATE_URL }}` from the Railway Postgres connect dialog.

Phase B: First deploy

1. Trigger deploy.
2. Wait for build and start to complete.
3. Verify service endpoint /healthz returns 200.
4. Verify service endpoint /api/healthz returns 200.

Phase C: Cloudflare DNS

1. Add CNAME using ops/cloudflare.dns.template.md.
2. Enable proxy.
3. Wait for DNS propagation.
4. Verify app.yourdomain.com/healthz and /api/healthz.

Phase D: External integrations

1. Clerk allowed URLs:
   - https://app.yourdomain.com
   - https://app.yourdomain.com/sign-in
   - https://app.yourdomain.com/sign-up
2. Stripe webhook endpoint:
   - https://app.yourdomain.com/api/stripe/webhook
3. Mobile EAS value:
   - EXPO_PUBLIC_API_URL=https://app.yourdomain.com

Phase E: Final smoke test

1. Web sign-in/sign-up.
2. Mobile sign-in.
3. Authenticated /api/auth/me from web and mobile.
4. Stripe checkout and return.
5. Subscription state update via webhook.

Reference runbook: DEPLOY_RAILWAY_CLOUDFLARE.md
