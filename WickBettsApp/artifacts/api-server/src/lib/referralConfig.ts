/**
 * Tunable constants for the referral program. See
 * docs/referral-program-plan.md for the reasoning behind each number —
 * these are the "open questions" from that doc turned into actual values,
 * kept in one place so they can be revisited without hunting through the
 * webhook handler or the scheduler.
 */

/** $5.00 per successful referral. */
export const REFERRAL_REWARD_CENTS = 500;

/** After this many rewarded referrals, a referrer becomes a permanent "ambassador" (see referralTierEnum) instead of earning more $5 credits. 10 x $5 = $50, one month of Membership. */
export const REFERRAL_CAP = 10;

/**
 * Days to wait after a referred subscription's first payment before
 * actually issuing the $5 credit. Exists to let the highest-risk window
 * for card-testing/fraud-driven chargebacks pass before money moves —
 * see the Fraud & abuse guardrails section of docs/referral-program-plan.md.
 */
export const REFERRAL_HOLD_DAYS = 7;

/**
 * Fixed Stripe Coupon ID for the lifetime 50%-off-Membership Ambassador
 * reward. Lazily created via the Stripe API the first time it's needed
 * (see ensureAmbassadorCoupon in lib/referrals.ts) rather than requiring a
 * manual dashboard step.
 */
export const AMBASSADOR_COUPON_ID = "wb-ambassador-membership-50off";

/** Max new *rewarded* referrals counted per referrer per day — a blunt guard against bulk/bot signup abuse. Enforced in lib/referrals.ts. */
export const REFERRAL_DAILY_LIMIT = 3;
