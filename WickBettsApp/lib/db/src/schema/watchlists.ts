import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const watchlistsTable = pgTable("watchlists", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  note: text("note"),
  targetPrice: text("target_price"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertWatchlistSchema = createInsertSchema(watchlistsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertWatchlist = z.infer<typeof insertWatchlistSchema>;
export type Watchlist = typeof watchlistsTable.$inferSelect;