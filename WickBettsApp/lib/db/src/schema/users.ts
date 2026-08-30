import { pgTable, text, timestamp, pgEnum, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["member", "admin"]);

// "standard" earns $5 referral credit per successful referral (capped —
// see REFERRAL_CAP in api-server/src/lib/referralConfig.ts). "ambassador"
// is permanent once granted: no more $5 credits, but a lifetime 50% off
// Membership instead. See docs/referral-program-plan.md.
export const referralTierEnum = pgEnum("referral_tier", ["standard", "ambassador"]);

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  googleId: text("google_id").unique(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  role: userRoleEnum("role").notNull().default("member"),
  stripeCustomerId: text("stripe_customer_id"),
  /** Expo push token for mobile push notifications */
  pushToken: text("push_token"),
  /** Whether to send push + email alerts for new signals (default on) */
  notifySignals: boolean("notify_signals").notNull().default(true),
  /** Whether to send push + email alerts for major news (default off) */
  notifyNews: boolean("notify_news").notNull().default(false),
  // Paid overage balance for Review My Trade: each subscriber gets 4 free
  // reviews per rolling 7-day window (enforced in routes/tradeReviews.ts by
  // counting recent rows, not by a separate counter here — see
  // docs/adr/0003-trade-review-ai-provider.md). Credits purchased at $2.50
  // each via Stripe are consumed only after the free weekly allotment runs
  // out, and never expire.
  extraTradeReviewCredits: integer("extra_trade_review_credits").notNull().default(0),
  // ── Referral program (docs/referral-program-plan.md) ──────────────────
  /**
   * This user's own shareable referral code. Generated once at account
   * creation (see jitProvisionUser in middlewares/requireAuth.ts) and
   * lazily backfilled for pre-existing accounts by GET /api/referrals/me.
   */
  referralCode: text("referral_code").unique(),
  /**
   * Who referred this user in, captured once at signup from the
   * `referralCode` a new account was created with. Never changed after
   * the fact. Deliberately NOT a DB foreign key — a self-referencing FK
   * on this table adds real complexity for no real benefit here, since
   * the value is only ever set once, from a code that was just looked up
   * against a real row. A dangling value (referrer account later
   * deleted) is handled defensively wherever this is read.
   */
  referredByUserId: text("referred_by_user_id"),
  /** How many of this user's referrals have actually been paid out with a $5 credit — drives the cap check. */
  rewardedReferralCount: integer("rewarded_referral_count").notNull().default(0),
  referralTier: referralTierEnum("referral_tier").notNull().default("standard"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
