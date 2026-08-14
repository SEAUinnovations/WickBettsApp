# Stripe Production Domain Test-Mode E2E Runbook

Purpose: verify end-to-end purchase and webhook processing for Signals, Mentorship, and Membership on the production domain using Stripe test mode.

## Scope

- Web checkout launch
- Stripe checkout completion
- Redirect success path
- Webhook delivery and signature validation
- Subscription persistence in database

## Safety rules

1. Use Stripe test mode keys and test webhook secret for this run.
2. Use dedicated tester accounts only.
3. Use one tester per plan to avoid cross-plan contamination.
4. Do not run this during a high-traffic window.

### Key labeling requirement

- Test secret keys must start with `sk_test_`.
- Test publishable keys must start with `pk_test_`.
- Live keys (`sk_live_`, `pk_live_`) must remain separate and unchanged during this run.

## Automated readiness gate

Before running manual checkout flows, run:

```bash
pnpm run verify:stripe:prod-test
```

This checks:

- `GET /healthz` and `GET /api/healthz` on production domain
- Railway origin `GET /healthz`
- `GET /api/news/feed` availability
- CORS preflight reachability for `POST /api/stripe/create-checkout`
- unauthenticated checkout route behavior (`401` expected)

Optional overrides:

```bash
APP_ORIGIN_TO_TEST=https://wickbetts.com \
RAILWAY_ORIGIN_TO_TEST=https://wickbettsapp-production.up.railway.app \
pnpm run verify:stripe:prod-test
```

## Preflight

1. Confirm deployed frontend includes all three checkout actions.
2. Confirm Railway variables are set for this test window:
   - STRIPE_SECRET_KEY set to test key
   - STRIPE_WEBHOOK_SECRET set to test webhook secret for production-domain test endpoint
   - STRIPE_PRICE_SIGNALS set to test price id
   - STRIPE_PRICE_MENTORSHIP set to test price id
   - STRIPE_PRICE_MEMBERSHIP set to test price id
   - APP_ORIGIN set to https://wickbetts.com
3. Confirm Stripe test-mode webhook endpoint URL is:
   - https://wickbetts.com/api/stripe/webhook
4. Confirm webhook events include:
   - customer.subscription.created
   - customer.subscription.updated
   - customer.subscription.deleted
5. Confirm the latest DB migration is applied, including membership plan enum support.

## Test data

Use three accounts:

- signals-tester@yourdomain
- mentorship-tester@yourdomain
- membership-tester@yourdomain

Use Stripe test card:

- 4242 4242 4242 4242
- Any future expiry
- Any CVC
- Any postal code

## Execution steps

### Run A: Signals

1. Sign in as signals-tester@yourdomain on https://wickbetts.com.
2. Start checkout for Signals.
3. Complete Stripe checkout with test card.
4. Verify browser returns to site with checkout success.
5. Verify app grants access.

### Run B: Mentorship

1. Sign in as mentorship-tester@yourdomain on https://wickbetts.com.
2. Start checkout for Mentorship.
3. Complete Stripe checkout with test card.
4. Verify browser returns to site with checkout success.
5. Verify app grants access.

### Run C: Membership

1. Sign in as membership-tester@yourdomain on https://wickbetts.com.
2. Start checkout for Membership.
3. Complete Stripe checkout with test card.
4. Verify browser returns to site with checkout success.
5. Verify app grants access.

## Verification checklist

For each run, capture all of the following:

1. Stripe checkout session id
2. Stripe subscription id
3. Webhook event id for customer.subscription.created
4. Webhook delivery status is 2xx
5. Server logs include webhook received entry
6. Subscriptions table row exists with expected plan and active or trialing status

Database verification query:

SELECT u.email,
       s.plan,
       s.status,
       s.stripe_subscription_id,
       s.current_period_end,
       s.updated_at
FROM subscriptions s
JOIN users u ON u.id = s.user_id
WHERE u.email IN (
  'signals-tester@yourdomain',
  'mentorship-tester@yourdomain',
  'membership-tester@yourdomain'
)
ORDER BY s.updated_at DESC;

Expected result:

- One row per tester
- plan matches the purchased plan
- status is active or trialing
- stripe_subscription_id is populated

## Evidence log template

Record one row per run:

- Plan:
- Tester email:
- Checkout session id:
- Subscription id:
- Webhook event id:
- Webhook delivery status:
- DB row verified:
- Notes:

## Failure triage

If checkout fails:

1. Confirm STRIPE_SECRET_KEY is test mode key in Railway.
2. Confirm selected plan price id exists in test mode and is active.

If webhook fails:

1. Confirm webhook endpoint path is exactly /api/stripe/webhook.
2. Confirm STRIPE_WEBHOOK_SECRET matches the test endpoint signing secret.
3. Confirm event types include subscription created and updated.

If DB row missing:

1. Confirm migration adding membership enum value is applied.
2. Confirm webhook logs show event receipt and no insert errors.

## After test run

1. Export evidence to release notes or deployment log.
2. Cancel test subscriptions in Stripe test mode.
3. If this window changed runtime keys, restore prior production key policy immediately.
