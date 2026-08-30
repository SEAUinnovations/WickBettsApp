# Wick Betts — Referral Program Plan

Reward structure as specified: a referrer gets **$5 back per person they refer who signs up for any paid subscription** (Signals, Mentorship, or Membership), up to **10 successful referrals lifetime** (10 × $5 = $50 — one month of Membership). After the 10th, the reward switches to a **lifetime 50% off Membership** instead of more $5 credits. This plan covers the mechanism that keeps the $5 "inside the transaction" rather than a cash payout, the fraud guardrails that mechanism needs, the actual margin math using your current prices, and a phased build order.

Two decisions from an earlier round of answers are baked in below: unsubscribed referrers still bank credit and it auto-applies whenever they next subscribe to anything, and the 50% lifetime discount is scoped to Membership specifically (not whatever plan the referrer happens to be on).

## Implementation status

Phase 1 (data model + attribution) and Phase 2 (reward issuance, including the hold period, cap enforcement, and the Ambassador tier) are implemented — see `docs/adr/0010-referral-program.md` for the exact mechanism decisions, and the file list below for what changed. Two things still need a human before this is live:

1. **Generate and review the database migration.** The schema files under `lib/db/src/schema/` now include the new `referrals` table and new `users` columns, but per `docs/adr/0001-drizzle-migrations-vs-push.md` the actual migration must be generated against a real database, not written by hand:
   ```
   cd lib/db
   DATABASE_URL=<your-db> pnpm exec drizzle-kit generate --config ./drizzle.config.ts
   ```
   Review the generated SQL and the journal diff, then commit it.
2. **Enable two new webhook events in the Stripe dashboard.** The clawback logic listens for `charge.refunded` and `charge.dispute.created`, neither of which was previously part of this app's webhook event selection — add them to the endpoint configuration in the Stripe dashboard (Developers → Webhooks → your endpoint → Select events).

Everything else — code, UI, and the Ambassador coupon (created lazily via the Stripe API the first time it's needed, no dashboard step required for that part) — is in place once those two steps are done.

**Files changed:**

- `lib/db/src/schema/users.ts`, `lib/db/src/schema/referrals.ts` (new), `lib/db/src/schema/index.ts` — schema.
- `artifacts/api-server/src/lib/db.ts` — re-exports.
- `artifacts/api-server/src/lib/referralConfig.ts` (new), `referralCode.ts` (new), `referrals.ts` (new) — core logic.
- `artifacts/api-server/src/middlewares/requireAuth.ts` — referral attribution capture at signup (email/password path).
- `artifacts/api-server/src/routes/referrals.ts` (new — `GET /me`, `POST /attribute`), `routes/index.ts`, `routes/stripe.ts` — API + webhook wiring.
- `artifacts/api-server/src/routes/admin.ts` — `GET`/`PATCH /api/admin/referrals`, the review queue for anything the daily-limit guard held.
- `artifacts/api-server/src/services/referralRewardScheduler.ts` (new) — reward issuance polling.
- `artifacts/wick-betts-mobile/app/refer.tsx` (new), `app/r/[code].tsx` (new), `app/admin/referrals.tsx` (new), `app/sign-up.tsx`, `app/login.tsx`, `app/_layout.tsx`, `app/(tabs)/profile.tsx`, `app/legal.tsx` — mobile UI + referral terms.
- `artifacts/wick-betts-mobile/components/GoogleSignInButton.tsx` (new) — shared Google sign-in, extracted out of `login.tsx` so the referral-attribution call only has to be written once.
- `docs/adr/0010-referral-program.md` (new).

**Known gap, called out deliberately rather than silently:**

- Self-referral detection is limited to the structural checks (first-subscription-only, one referral row per referred person ever, a per-referrer daily limit that holds suspicious volume for the admin queue below). The higher-value check — matching payment-method/card fingerprint between a referrer and a referred account — is not built yet; see the Fraud & abuse guardrails section below. Google OAuth sign-in and the admin review queue, both previously listed here as gaps, are now implemented (see below).

## The core mechanism: credit, not cash

You said it yourself — the goal is a way to reward the $5 "as part of the transaction," not as money you pay out. The way to do that is a **Stripe customer balance credit** applied to the *referrer's own account*, not a payout to a bank account, PayPal, or Venmo. Concretely: when a referral converts, the backend calls Stripe to add a $5 negative balance to the referrer's Stripe customer object. Stripe automatically applies that balance to the referrer's *next* invoice, reducing what they're charged — on whatever plan they're on, which is exactly the "gives them value no matter what plan they're on" behavior you asked for, since Stripe balance credit isn't scoped to a specific price. No money leaves your bank account to a third party — it just shows up as $5 less revenue collected on one existing customer's renewal.

This matters for three reasons:

1. **No payout infrastructure.** Cash rewards (PayPal Payouts, Venmo, ACH via Tremendous/Stripe Connect) mean KYC on recipients, payout fraud review, and a second system to build and reconcile. A Stripe balance credit is a native Stripe object — it's already inside the billing system you have.
2. **No 1099 exposure.** Cash-equivalent payments to individuals above IRS thresholds generally trigger 1099-NEC/1099-K reporting. Store credit with no cash-out value normally sits outside that — but say so explicitly in the program terms ("credit has no cash value and cannot be redeemed for cash"), which is standard language for exactly this reason and is now in `app/legal.tsx`. Flag this to your accountant before launch to confirm for your situation; I'm not able to give you a compliance sign-off, only the standard pattern other subscription products use.
3. **It only has value to a paying customer.** A $5 balance sits on a Stripe customer record until there's an invoice to apply it against. If a referrer isn't currently subscribed, the credit banks silently (the reward scheduler creates a Stripe customer for them if they don't have one yet, purely to hold the balance) and applies automatically the moment they subscribe to anything — Stripe balances don't expire, so this needed no extra bookkeeping beyond that.

## What "the margin splits" actually looks like

Your current prices (from `components/Billing.tsx`): **Membership $50/mo, Signals $250/mo, Mentorship $500/mo**. The $5 reward is flat regardless of which plan the *referred* person buys, but it's deducted from the *referrer's* next invoice — not the new subscriber's first payment. That distinction matters for how you think about the "cost":

| Referred person's plan | Their first payment (full price, no discount) | $5 as % of that first payment |
|---|---|---|
| Membership | $50.00 | 10% |
| Signals | $250.00 | 2% |
| Mentorship | $500.00 | 1% |

The company never takes in less than full price from the *new* subscriber. What actually happens is the *referrer's* next renewal comes in $5 lighter than it otherwise would have. Blended across the pair of accounts for that billing cycle, a Membership-tier referral pair nets $95 instead of $100 (a 5% haircut on that pair, funded entirely by revenue already flowing through the system); a Mentorship-tier referral pair nets $995 instead of $1,000 (0.5%). This is the cleanest way to describe "referral margin vs. direct-signup margin" to yourself or a bookkeeper: it's a $5-per-conversion marketing cost, booked as a discount against existing recurring revenue, not a new expense line.

Worst-case exposure per referrer before the cap kicks in: 10 × $5 = **$50 lifetime** — exactly one month of Membership — after which the cost shape changes entirely. See the Ambassador tier below.

## The 10-referral cap → lifetime 50% off Membership

Once a referrer crosses 10 rewarded referrals, stop issuing $5 credits and instead mark their account "Ambassador" with a permanent 50%-off coupon scoped to the Membership plan ($50 → $25/mo, forever, applied automatically the moment they're on or switch to Membership). A few things worth deciding deliberately here:

- **Cost shape changes, not just the amount.** $5 credits are a one-time, capped, per-conversion cost. A lifetime 50% discount is an *ongoing* cost for as long as that person stays subscribed to Membership — $25/mo forever is a very different kind of commitment than a one-time $5. It's the right reward for your top referrers precisely because it's a status/loyalty reward, not a scalable per-referral payout — make sure that's the intent, since it's the one piece of this program with no cap.
- If the referrer is on Signals or Mentorship when they hit 10, the 50% Membership discount sits waiting (per your answer) rather than discounting their current plan — the Refer & Earn screen (`app/refer.tsx`) calls this out explicitly once Ambassador status is granted.
- Implementation: a Stripe Coupon with `duration: forever`, `percent_off: 50`, created lazily via the Stripe API (`wb-ambassador-membership-50off`) the first time it's needed. It carries no Stripe-side product restriction — the code only ever attaches it to a Membership subscription, which is where the "Membership only" rule is actually enforced. See `docs/adr/0010-referral-program.md`.

## Fraud & abuse guardrails

A $5-per-signup incentive attracts exactly the abuse you'd expect — fake accounts, self-referrals, card-testing. What's implemented today, and what's still open:

- **New customers only — implemented.** A referral only counts if this is the referred person's first-ever subscription on this account (checked by counting their `subscriptions` rows at conversion time).
- **One referral per referred person, ever — implemented.** A unique constraint on `referrals.referredUserId` makes it structurally impossible to count the same person twice, closing the "cancel and resubscribe" loophole without any extra application logic.
- **Per-referrer daily limit — implemented.** More than `REFERRAL_DAILY_LIMIT` (3) new referrals from the same referrer in 24 hours get recorded but held (`status: "pending"`, `fraudFlag: true`) instead of auto-converting — a blunt guard against bulk/bot signup abuse, pending a proper review queue.
- **Hold before crediting, not instant — implemented.** The $5 isn't issued the moment checkout completes; a 7-day hold (`REFERRAL_HOLD_DAYS`) passes first, giving the highest-risk window for card disputes/card-testing time to surface before money moves.
- **Clawback on dispute — implemented.** If a referred subscription's originating charge is later refunded or disputed, the $5 credit is reversed with a positive balance transaction. Since `app/legal.tsx` states "all sales are final, no refunds," voluntary refund-driven clawbacks should be rare — this guardrail is really about card-network chargebacks and Stripe Radar-flagged disputes, which the no-refund policy doesn't prevent. Requires enabling `charge.refunded` and `charge.dispute.created` on the Stripe webhook endpoint (see Implementation status above).
- **Self-referral blocking by card/device fingerprint — not yet built.** This is the single highest-value fraud check still missing: nothing today stops someone from referring a second email address they also control, short of it tripping the daily volume limit. Closing this requires comparing Stripe PaymentMethod fingerprints (or similar) between the referrer and the referred account, which needs additional Stripe API calls at conversion time — a deliberate follow-up, not an oversight.
- **Admin visibility — implemented.** `GET /api/admin/referrals` lists every referral (enriched with referrer/referred email and name), and `PATCH /api/admin/referrals/:id` with `{ action: "approve" | "block" }` clears anything the daily-limit guard held for review — approving moves it into the normal converted → rewarded pipeline (still subject to the usual hold period, not credited immediately) rather than crediting it on the spot. The mobile side is `app/admin/referrals.tsx`, linked from Profile → Account → "Referral queue" (admin-only), following the same list-plus-status-action pattern already used by the support-ticket and mentorship-request admin screens.

## Data model (as implemented)

- **`referrals`** (`lib/db/src/schema/referrals.ts`): `id`, `referrerId`, `referredUserId` (unique), `referredSubscriptionId`, `status` (`pending` / `converted` / `rewarded` / `clawed_back` / `blocked`), `rewardAmountCents`, `convertedAt`, `rewardEligibleAt`, `rewardedAt`, `clawedBackAt`, `fraudFlag`.
- **`users` additions** (`lib/db/src/schema/users.ts`): `referralCode` (unique, generated at signup), `referredByUserId` (set once at signup, never changed — deliberately not a DB foreign key, see the schema comment for why), `rewardedReferralCount`, `referralTier` (`standard` / `ambassador`).

The webhook flow lives in `routes/stripe.ts`'s existing `customer.subscription.created` case (attribution) plus two new cases for `charge.refunded` / `charge.dispute.created` (clawback), backed by helper functions in `lib/referrals.ts`. A standalone poller, `services/referralRewardScheduler.ts`, issues the actual credit once a conversion's hold period passes — modeled on the existing `emailDigestScheduler.ts` pattern but on a plain 30-minute interval rather than a wall-clock-aligned schedule, since a referral reward has no "day of week" meaning.

## UI/UX (as implemented)

- **"Refer & Earn" screen** (`app/refer.tsx`, linked from Profile → Account): referral link with the native share sheet (React Native's built-in `Share` API — no new dependency needed), progress toward the cap, credits earned so far, and an Ambassador badge once unlocked.
- **Referral code field at sign-up** (`app/sign-up.tsx`): optional, pre-filled automatically when reached via a referral link.
- **Referral link landing route** (`app/r/[code].tsx`): `wickbetts.com/r/<code>` (and the native deep-link equivalent) redirects straight into sign-up with the code carried along as a query param.
- **Google sign-in, both screens** (`components/GoogleSignInButton.tsx`, used by `app/login.tsx` and `app/sign-up.tsx`): a referred person can now sign up with Google, not just email/password — the sign-up screen offers both. The code is attributed via a follow-up API call right after the OAuth session activates (`POST /api/referrals/attribute`), since Google's flow has no point to pre-set it the way email/password sign-up can. See `docs/adr/0010-referral-program.md` for exactly what guards this against being (ab)used to retroactively attribute an existing account.
- **Admin referral queue** (`app/admin/referrals.tsx`, Profile → Account → "Referral queue", admin-only): approve or block anything the daily-limit fraud guard held.
- **Legal terms** (`app/legal.tsx`): a new "Referral program" section covering eligibility, the no-cash-value clause, the cap/Ambassador transition, and the public-sharing disclosure note.

## Phased build order (updated)

1. ~~Data model + attribution capture~~ — done, both the email/password and Google OAuth paths.
2. ~~Reward issuance~~ — done (hold period, Stripe balance credit, cap enforcement, Ambassador coupon).
3. **Fraud guardrails — mostly done.** Structural guards (first-subscription-only, unique referral row, daily limit) and the admin review queue for anything they hold are in; card/device fingerprint matching is the one piece still open. Recommended before any public (non-invite-only) launch, though the daily limit + manual review queue together already provide a real backstop in the meantime.
4. ~~Mobile UI~~ — done (Refer & Earn screen, share sheet, deep linking, sign-up field, Google sign-in on both auth screens).
5. ~~Ambassador tier~~ — done.
6. ~~Admin queue~~ — done (`app/admin/referrals.tsx`, `GET`/`PATCH /api/admin/referrals`).

What's left before a public (non-invite-only) launch: the database migration and the two Stripe webhook events from Implementation status above (both need a human with real credentials/dashboard access), and — as a judgment call, not a hard blocker — deciding whether the card/device fingerprint check is worth building before opening this beyond a small invite-only cohort, or whether the daily-limit + admin-queue backstop is enough to start with and tighten later based on what abuse (if any) actually shows up.

## Open questions worth revisiting

- **Per-day rate limit number** — 3 new referrals/day is a starting guess; tune based on how organic your expected sharing pattern actually looks once this is live.
- **Whether existing members get a referral code retroactively** — yes, in practice: `GET /api/referrals/me` lazily generates one for any account that doesn't have one yet, so every existing member gets a code the first time they open the Refer & Earn screen.
