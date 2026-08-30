import type Stripe from "stripe";
import { randomUUID } from "crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, usersTable, subscriptionsTable, referralsTable } from "./db.js";
import { logger } from "./logger.js";
import {
  REFERRAL_HOLD_DAYS,
  REFERRAL_REWARD_CENTS,
  REFERRAL_DAILY_LIMIT,
  AMBASSADOR_COUPON_ID,
} from "./referralConfig.js";

/**
 * Records a referral conversion the first time a referred user's
 * subscription goes active/trialing. Called from the Stripe webhook
 * handler for `customer.subscription.created` (routes/stripe.ts) — see
 * docs/referral-program-plan.md for the full reward lifecycle. There's no
 * separate "payment succeeded, waiting to convert" step to watch for here:
 * Stripe Checkout collects payment before the subscription object is
 * created, so by the time this event fires the charge has already gone
 * through.
 *
 * Guards against double-counting or gaming:
 *  - only a user's first-ever subscription can trigger a referral (no
 *    crediting a friend who cancels and resubscribes with the same code)
 *  - `referrals.referredUserId` is unique, so a retried/duplicate webhook
 *    delivery can never create a second row for the same referred person
 *  - a referrer who has already produced REFERRAL_DAILY_LIMIT conversions
 *    in the last 24 hours gets this one recorded but flagged for manual
 *    review (status stays "pending", not "converted") instead of being
 *    auto-queued for a reward — a blunt guard against bulk/bot signups
 */
export async function maybeRecordReferralConversion(userId: string, subscriptionId: string): Promise<void> {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user?.referredByUserId || user.referredByUserId === userId) return;

    const allSubs = await db
      .select({ id: subscriptionsTable.id })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, userId));
    if (allSubs.length !== 1) return; // only a first-ever subscription counts

    const existing = await db
      .select({ id: referralsTable.id })
      .from(referralsTable)
      .where(eq(referralsTable.referredUserId, userId))
      .limit(1);
    if (existing.length > 0) return;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentByThisReferrer = await db
      .select({ id: referralsTable.id })
      .from(referralsTable)
      .where(and(eq(referralsTable.referrerId, user.referredByUserId), gte(referralsTable.createdAt, oneDayAgo)));
    const overDailyLimit = recentByThisReferrer.length >= REFERRAL_DAILY_LIMIT;

    await db.insert(referralsTable).values({
      id: randomUUID(),
      referrerId: user.referredByUserId,
      referredUserId: userId,
      referredSubscriptionId: subscriptionId,
      status: overDailyLimit ? "pending" : "converted",
      rewardAmountCents: REFERRAL_REWARD_CENTS,
      convertedAt: overDailyLimit ? null : new Date(),
      rewardEligibleAt: overDailyLimit ? null : new Date(Date.now() + REFERRAL_HOLD_DAYS * 24 * 60 * 60 * 1000),
      fraudFlag: overDailyLimit,
    } as any);

    if (overDailyLimit) {
      logger.warn(
        { referrerId: user.referredByUserId, referredUserId: userId },
        "Referral held for manual review — referrer exceeded the daily new-referral limit",
      );
    } else {
      logger.info(
        { referrerId: user.referredByUserId, referredUserId: userId },
        "Referral converted — reward scheduled after hold period",
      );
    }
  } catch (err) {
    logger.error(err, "maybeRecordReferralConversion failed");
  }
}

/**
 * Reverses a referral reward when the referred subscription's originating
 * charge is refunded or disputed. Looked up by the referred user's Stripe
 * customer ID, so this is called from both the `charge.refunded` and
 * `charge.dispute.created` webhook cases in routes/stripe.ts.
 *
 * Deliberately does not revoke an already-granted Ambassador tier even if
 * this pushes the referrer's count back under the cap — once granted,
 * Ambassador status is meant to stick (see docs/referral-program-plan.md).
 */
export async function clawBackReferralIfAny(referredUserId: string, stripe: Stripe): Promise<void> {
  const [referral] = await db
    .select()
    .from(referralsTable)
    .where(eq(referralsTable.referredUserId, referredUserId))
    .limit(1);
  if (!referral || referral.status === "clawed_back" || referral.status === "blocked") return;

  if (referral.status === "rewarded" && referral.rewardAmountCents > 0) {
    const [referrer] = await db.select().from(usersTable).where(eq(usersTable.id, referral.referrerId)).limit(1);
    if (referrer?.stripeCustomerId) {
      try {
        await stripe.customers.createBalanceTransaction(referrer.stripeCustomerId, {
          amount: referral.rewardAmountCents,
          currency: "usd",
          description: "Referral reward reversed — referred subscription refunded/disputed",
        });
      } catch (err) {
        logger.error(err, "Failed to reverse referral balance credit during clawback");
      }
    }
    await db
      .update(usersTable)
      .set({
        rewardedReferralCount: sql`greatest(${usersTable.rewardedReferralCount} - 1, 0)`,
        updatedAt: new Date(),
      } as object)
      .where(eq(usersTable.id, referral.referrerId));
  }

  await db
    .update(referralsTable)
    .set({ status: "clawed_back", clawedBackAt: new Date(), updatedAt: new Date() } as object)
    .where(eq(referralsTable.id, referral.id));

  logger.warn(
    { referralId: referral.id, referredUserId },
    "Referral clawed back — refund or dispute on the referred subscription",
  );
}

let cachedAmbassadorCoupon: Stripe.Coupon | null = null;

/**
 * Fetches (or lazily creates) the Stripe coupon backing the lifetime 50%
 * Ambassador discount, caching it in memory once found. No manual Stripe
 * dashboard step required. The coupon itself carries no product
 * restriction in Stripe — every call site in this codebase only ever
 * attaches it to a Membership subscription, which is where "Membership
 * specifically" is actually enforced.
 */
export async function ensureAmbassadorCoupon(stripe: Stripe): Promise<Stripe.Coupon> {
  if (cachedAmbassadorCoupon) return cachedAmbassadorCoupon;
  try {
    cachedAmbassadorCoupon = await stripe.coupons.retrieve(AMBASSADOR_COUPON_ID);
  } catch {
    cachedAmbassadorCoupon = await stripe.coupons.create({
      id: AMBASSADOR_COUPON_ID,
      duration: "forever",
      percent_off: 50,
      name: "Wick Betts Ambassador — 50% off Membership for life",
    });
  }
  return cachedAmbassadorCoupon;
}

/**
 * Applies the lifetime 50%-off-Membership discount once a referrer has
 * Ambassador status and an active Membership subscription. If they're not
 * on Membership yet, this is a no-op — the discount gets attached at
 * checkout time instead (see the create-checkout route in
 * routes/stripe.ts) once they actually subscribe to it.
 */
export async function applyAmbassadorRewardIfEligible(referrerId: string, stripe: Stripe): Promise<void> {
  try {
    const subs = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, referrerId));
    const membership = subs.find((s) => s.plan === "membership" && (s.status === "active" || s.status === "trialing"));
    if (!membership) return;

    const coupon = await ensureAmbassadorCoupon(stripe);
    await stripe.subscriptions.update(membership.stripeSubscriptionId, {
      discounts: [{ coupon: coupon.id }],
    });
    logger.info(
      { referrerId, subscriptionId: membership.stripeSubscriptionId },
      "Applied lifetime Ambassador discount to active Membership subscription",
    );
  } catch (err) {
    logger.error({ err, referrerId }, "Failed to apply Ambassador reward");
  }
}
