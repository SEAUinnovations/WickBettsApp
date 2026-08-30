import { pgTable, text, timestamp, pgEnum, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * Lifecycle of one referral (one referrer + one referred person):
 *
 *   converted    → the referred person's first-ever subscription went active/trialing.
 *   rewarded     → the hold period passed with no dispute; the $5 credit was
 *                  issued (or, once the referrer is past the cap, this
 *                  referral was simply counted with rewardAmountCents = 0).
 *   clawed_back  → the referred subscription's originating charge was later
 *                  refunded or disputed; any credit already issued was reversed.
 *   blocked      → failed a fraud check and was never counted at all.
 *
 * There's no separate "pending" state in practice: by the time
 * `customer.subscription.created` fires with an entitling status, Stripe
 * Checkout has already collected payment, so a referral is recorded
 * straight into "converted". The enum value is kept for forward
 * compatibility (e.g. a future non-Checkout signup path) and for any
 * pending row a manual admin review holds before conversion.
 */
export const referralStatusEnum = pgEnum("referral_status", [
  "pending",
  "converted",
  "rewarded",
  "clawed_back",
  "blocked",
]);

export const referralsTable = pgTable("referrals", {
  id: text("id").primaryKey(),
  referrerId: text("referrer_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // Unique: a given person can only ever be counted as a referral once,
  // no matter how many times they resubscribe later — this is the primary
  // guard against re-subscription/cancel-and-rejoin abuse.
  referredUserId: text("referred_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  referredSubscriptionId: text("referred_subscription_id"),
  status: referralStatusEnum("status").notNull().default("pending"),
  /** Always 500 ($5.00) today; kept as a column rather than a constant in case the reward amount ever changes. */
  rewardAmountCents: integer("reward_amount_cents").notNull().default(500),
  convertedAt: timestamp("converted_at"),
  /** When the hold period ends and the reward scheduler is allowed to issue the credit. */
  rewardEligibleAt: timestamp("reward_eligible_at"),
  rewardedAt: timestamp("rewarded_at"),
  clawedBackAt: timestamp("clawed_back_at"),
  /** Set by fraud checks for anything that should stop short of auto-crediting and wait for a human to look at it. */
  fraudFlag: boolean("fraud_flag").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertReferralSchema = createInsertSchema(referralsTable).omit({ createdAt: true, updatedAt: true });
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referralsTable.$inferSelect;
