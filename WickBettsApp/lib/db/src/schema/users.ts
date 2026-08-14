import { pgTable, text, timestamp, pgEnum, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["member", "admin"]);

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
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
