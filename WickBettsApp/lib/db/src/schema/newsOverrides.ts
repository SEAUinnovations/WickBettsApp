import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const newsOverridesTable = pgTable("news_overrides", {
  id: text("id").primaryKey(),
  sourceArticleId: text("source_article_id").notNull().unique(),
  headline: text("headline"),
  summary: text("summary"),
  category: text("category"),
  source: text("source"),
  url: text("url"),
  publishedAt: text("published_at"),
  updatedBy: text("updated_by").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertNewsOverrideSchema = createInsertSchema(newsOverridesTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertNewsOverride = z.infer<typeof insertNewsOverrideSchema>;
export type NewsOverride = typeof newsOverridesTable.$inferSelect;