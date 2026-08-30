import { and, eq, lte } from "drizzle-orm";
import { db, referralsTable, usersTable, type Referral } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { getStripe } from "../lib/stripeClient.js";
import { REFERRAL_CAP } from "../lib/referralConfig.js";
import { applyAmbassadorRewardIfEligible } from "../lib/referrals.js";

/**
 * Periodically issues the $5 referral credit for any conversion whose hold
 * period (docs/referral-program-plan.md's fraud-window delay) has passed.
 * Deliberately a simple polling interval rather than a wall-clock-aligned
 * timer like the weekly ops digest (services/emailDigestScheduler.ts) —
 * referral rewards have no "day of week" meaning, they just need to fire
 * soon after `rewardEligibleAt` passes, so a short fixed interval is the
 * right shape here.
 */
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // every 30 minutes
let schedulerStarted = false;

async function processDueReferralRewards(): Promise<void> {
  const stripe = getStripe();
  if (!stripe) return; // Stripe not configured (e.g. local dev) — nothing to do

  let due: Referral[];
  try {
    due = await db
      .select()
      .from(referralsTable)
      .where(and(eq(referralsTable.status, "converted"), lte(referralsTable.rewardEligibleAt, new Date())));
  } catch (err) {
    logger.error(err, "referralRewardScheduler: failed to query due referrals");
    return;
  }

  for (const referral of due) {
    try {
      const [referrer] = await db.select().from(usersTable).where(eq(usersTable.id, referral.referrerId)).limit(1);
      if (!referrer) {
        logger.warn({ referralId: referral.id }, "Referral reward skipped — referrer account no longer exists");
        await db
          .update(referralsTable)
          .set({ status: "blocked", updatedAt: new Date() } as object)
          .where(eq(referralsTable.id, referral.id));
        continue;
      }

      // Cap already reached (e.g. several referrals became eligible in the
      // same batch) — this one still counts as a successful referral for
      // display purposes, but earns no further credit: the reward has
      // already shifted to the lifetime Ambassador discount.
      if (referrer.rewardedReferralCount >= REFERRAL_CAP) {
        await db
          .update(referralsTable)
          .set({ status: "rewarded", rewardedAt: new Date(), rewardAmountCents: 0, updatedAt: new Date() } as object)
          .where(eq(referralsTable.id, referral.id));
        continue;
      }

      // Every dollar of reward lives on the referrer's own Stripe customer
      // balance, not in a separate ledger — see docs/referral-program-plan.md
      // ("The core mechanism: credit, not cash"). A referrer with no Stripe
      // customer yet (never started a checkout) gets one created here purely
      // as a place to hold the balance; Stripe auto-applies it to their
      // first invoice whenever they do subscribe, via the same
      // `if (!customerId)` pattern already used in routes/stripe.ts's
      // create-checkout.
      let stripeCustomerId = referrer.stripeCustomerId;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: referrer.email,
          name: referrer.name,
          metadata: { userId: referrer.id },
        });
        stripeCustomerId = customer.id;
        await db
          .update(usersTable)
          .set({ stripeCustomerId, updatedAt: new Date() })
          .where(eq(usersTable.id, referrer.id));
      }

      await stripe.customers.createBalanceTransaction(stripeCustomerId, {
        amount: -referral.rewardAmountCents,
        currency: "usd",
        description: `Referral reward — $${(referral.rewardAmountCents / 100).toFixed(2)} credit toward your next charge`,
      });

      const newCount = referrer.rewardedReferralCount + 1;
      const userUpdates: Record<string, unknown> = { rewardedReferralCount: newCount, updatedAt: new Date() };
      const justBecameAmbassador = newCount >= REFERRAL_CAP && referrer.referralTier !== "ambassador";
      if (justBecameAmbassador) {
        userUpdates.referralTier = "ambassador";
      }
      await db.update(usersTable).set(userUpdates).where(eq(usersTable.id, referrer.id));
      await db
        .update(referralsTable)
        .set({ status: "rewarded", rewardedAt: new Date(), updatedAt: new Date() } as object)
        .where(eq(referralsTable.id, referral.id));

      logger.info({ referralId: referral.id, referrerId: referrer.id, newCount }, "Referral reward issued");

      if (justBecameAmbassador) {
        logger.info({ referrerId: referrer.id }, "Referrer crossed the referral cap — now an Ambassador");
        await applyAmbassadorRewardIfEligible(referrer.id, stripe);
      }
    } catch (err) {
      logger.error({ err, referralId: referral.id }, "Failed to process referral reward");
    }
  }
}

export function startReferralRewardScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  logger.info({ intervalMs: CHECK_INTERVAL_MS }, "Referral reward scheduler started");
  void processDueReferralRewards();
  setInterval(() => {
    void processDueReferralRewards();
  }, CHECK_INTERVAL_MS);
}

startReferralRewardScheduler();
