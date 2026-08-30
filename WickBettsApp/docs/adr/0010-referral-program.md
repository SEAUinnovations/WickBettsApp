# 0010: Referral program — Stripe balance credit, not a cash payout

## Status

Accepted.

## Context

The product wanted a referral program: $5 back per successful referral, up
to a cap, after which the reward becomes a permanent discount. The open
question was mechanical, not conceptual — how to pay the $5 without
building a cash-payout system (PayPal/Venmo/ACH), since that adds KYC,
payout fraud review, and likely 1099 reporting obligations for a feature
that's meant to be lightweight. Full design reasoning, margin math, and the
fraud-guardrail rationale live in `docs/referral-program-plan.md`; this ADR
covers the implementation decisions made to build it.

## Decision

**Reward mechanism.** A referral reward is a Stripe customer-balance credit
on the *referrer's* Stripe customer object (`stripe.customers.
createBalanceTransaction`), not a payout to a third-party system. Stripe
auto-applies a negative balance to a customer's next invoice regardless of
which plan they're on, which is exactly the "no matter what plan they're
on" requirement — no extra logic needed to route the discount to a specific
price. If a referrer has no Stripe customer yet (never started a checkout),
the reward scheduler creates one purely to hold the balance, reusing the
same `if (!customerId)` pattern already used in `create-checkout`. This
means the credit "banks" correctly even for a referrer who isn't currently
subscribed, satisfying the product requirement that referral credit accrue
independent of subscription status.

**Cap and Ambassador tier.** `REFERRAL_CAP = 10` (`lib/referralConfig.ts`) —
10 × $5 = $50, deliberately equal to one month of Membership. Past the cap,
`users.referralTier` flips to `"ambassador"` and a lazily-created, cached
Stripe Coupon (`wb-ambassador-membership-50off`, `duration: forever`,
`percent_off: 50`) gets attached wherever a Membership subscription is
created or already exists for that user. The coupon itself carries no
Stripe-side product restriction — every attach point in this codebase only
ever calls it against a Membership subscription, so "Membership
specifically" is enforced in application code, not by a Stripe-side rule.
Crossing the cap is permanent: a later clawback (below) can reduce
`rewardedReferralCount` back under 10 without revoking Ambassador status.

**Conversion trigger.** A referral converts inside the existing
`customer.subscription.created` webhook case in `routes/stripe.ts`, guarded
by: the referred user has a `referredByUserId`, this is their first-ever
subscription (`subscriptions` row count === 1), and no `referrals` row
already exists for them (`referrals.referredUserId` is a unique column,
closing both the double-count and the cancel-and-resubscribe path). There's
no separate "pending, awaiting payment" state to model — Stripe Checkout
collects payment before the subscription object exists, so by the time this
event fires with an entitling status, the charge already succeeded.

**Hold period and clawback.** A converted referral schedules its reward for
`REFERRAL_HOLD_DAYS` (7) days out rather than crediting immediately; a
separate polling scheduler (`services/referralRewardScheduler.ts`, 30-minute
interval — not wall-clock-aligned like the weekly ops digest, since there's
no calendar meaning to a referral reward) issues the credit once that time
passes. `charge.refunded` and `charge.dispute.created` webhook cases reverse
an already-issued credit via a positive balance transaction, matched to the
right referral by the referred user's Stripe customer ID rather than by
threading a charge/invoice ID through — one lookup path covers both event
types identically. These two event types are not part of this app's
previous webhook selection and need to be enabled on the Stripe dashboard's
webhook endpoint configuration; that's an ops step, not something settable
from code.

**Attribution capture — two paths.** For email/password sign-up
(`app/sign-up.tsx`), a referral code is captured once, at account creation,
via Clerk `unsafeMetadata.referralCode` — the same mechanism already used
for `unsafeMetadata.username` (see `resolveClerkIdentity` in
`middlewares/requireAuth.ts`). It's read only inside `jitProvisionUser`'s
`if (!user)` branch, so it has no effect on an already-existing account.

Google OAuth (`components/GoogleSignInButton.tsx`, shared by both
`app/login.tsx` and `app/sign-up.tsx`) can't use that same trick — Clerk
doesn't know whether an OAuth attempt will create a new account or sign
into an existing one until *after* the redirect completes, so there's no
point beforehand to stash metadata. Instead, `POST /api/referrals/attribute`
(`routes/referrals.ts`) is called client-side immediately after the OAuth
session goes active. It preserves the same "never retroactive" guarantee
the at-signup path gets for free from timing: it only succeeds when the
account has no `referredByUserId` yet **and** no subscription yet, so it
can only ever attribute a still-fresh, not-yet-converted account — once
someone has converted, this endpoint can no longer touch their referral
attribution at all, closing the same gap it would otherwise reopen.

Every new user also gets their own referral code generated at creation time
(`generateUniqueReferralCode`, check-then-insert against
`users.referral_code`), with lazy backfill via `GET /api/referrals/me` for
any account created before this shipped.

**Fraud guardrails shipped in this pass:** first-subscription-only,
one-referral-row-per-referred-user (DB unique constraint), a per-referrer
daily limit (`REFERRAL_DAILY_LIMIT = 3`) that holds a referral at
`status: "pending"` with `fraudFlag: true` instead of auto-converting it,
and an admin review queue (`GET`/`PATCH /api/admin/referrals`,
`app/admin/referrals.tsx`) to approve or block anything held that way.
**Not yet built:** self-referral detection via shared payment-method/card
fingerprint — the single highest-value fraud check per
`docs/referral-program-plan.md`, requiring additional Stripe Radar/
PaymentMethod API calls at conversion time. This remains a documented
follow-up, not a silent gap: today, nothing stops someone from referring a
second email address they also control, short of it tripping the daily
volume limit.

## Consequences

- A migration for the new `referrals` table and the new `users` columns
  (`referral_code`, `referred_by_user_id`, `rewarded_referral_count`,
  `referral_tier`) still needs to be generated and reviewed by hand per
  ADR 0001 (`drizzle-kit generate`, not `push`, against a real database) —
  not run as part of this change since no live database credential was
  available to do it correctly.
- Referral progress and the shareable link surface in the new "Refer &
  earn" screen (`app/refer.tsx`, linked from Profile → Account), and the
  referral terms are appended to `app/legal.tsx`.
- The admin referral queue reuses the existing `requireAdmin` gate and the
  same list/PATCH-status shape already established by
  `routes/admin.ts`'s ticket and mentorship-request endpoints — no new
  authorization pattern introduced.
