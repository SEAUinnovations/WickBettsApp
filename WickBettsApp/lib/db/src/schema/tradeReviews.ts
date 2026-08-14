import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const tradeBiasEnum = pgEnum("trade_bias", ["Bullish", "Bearish", "Neutral"]);
export const tradeReviewVerdictEnum = pgEnum("trade_review_verdict", ["Agrees", "Disagrees", "Mixed"]);

// "Review My Trade" — a member posts a chart screenshot + their setup
// description + stated bias, Claude reviews the chart and responds
// instantly (no admin in the loop), and the whole thing posts into the
// Community tab so other subscribers can see both the trade and the read.
export const tradeReviewsTable = pgTable("trade_reviews", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull().references(() => usersTable.id),
  // Data URL (e.g. "data:image/jpeg;base64,...") — stored inline rather than
  // in external object storage to avoid standing up new storage
  // infrastructure/credentials for the first version of this feature.
  imageDataUrl: text("image_data_url").notNull(),
  description: text("description").notNull(),
  bias: tradeBiasEnum("bias").notNull(),
  // Structured output from Claude's vision review — see services/tradeReview.ts
  aiTechnicalRead: text("ai_technical_read").notNull(),
  aiVerdict: tradeReviewVerdictEnum("ai_verdict").notNull(),
  aiBiasExplanation: text("ai_bias_explanation").notNull(),
  aiRiskNote: text("ai_risk_note").notNull(),
  aiSummary: text("ai_summary").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTradeReviewSchema = createInsertSchema(tradeReviewsTable).omit({
  createdAt: true,
});
export type InsertTradeReview = z.infer<typeof insertTradeReviewSchema>;
export type TradeReview = typeof tradeReviewsTable.$inferSelect;
