import { pgTable, text, timestamp, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { marketEnum, directionEnum } from "./signals";

// Member-shared signals are a distinct, deliberately lean feature from the
// admin-curated `signals` table: any subscribed member can post one, they
// never appear in the paid /signals feed, and there's no options/Greeks
// detail — just enough structure (ticker, direction, entry/target/stop, a
// short thesis) to be scannable in a feed, plus a simple Open/Closed status
// the author toggles themselves. See docs/adr for the full reasoning.
export const communitySignalStatusEnum = pgEnum("community_signal_status", ["Open", "Closed"]);

export const communitySignalsTable = pgTable("community_signals", {
  id: text("id").primaryKey(),
  authorId: text("author_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  asset: text("asset").notNull(),
  market: marketEnum("market").notNull(),
  direction: directionEnum("direction").notNull(),
  entry: text("entry").notNull(),
  target: text("target").notNull(),
  stop: text("stop"),
  note: text("note").notNull(),
  status: communitySignalStatusEnum("status").notNull().default("Open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCommunitySignalSchema = createInsertSchema(communitySignalsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertCommunitySignal = z.infer<typeof insertCommunitySignalSchema>;
export type CommunitySignal = typeof communitySignalsTable.$inferSelect;

// "Follow a person" — the follower automatically sees everything `following`
// posts to communitySignalsTable in their personalized feed. Deliberately
// modeled as user-to-user (not per-signal bookmarking), per product decision.
export const memberFollowsTable = pgTable(
  "member_follows",
  {
    id: text("id").primaryKey(),
    followerId: text("follower_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    followingId: text("following_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("member_follows_follower_following_idx").on(table.followerId, table.followingId),
  ],
);

export const insertMemberFollowSchema = createInsertSchema(memberFollowsTable).omit({
  createdAt: true,
});
export type InsertMemberFollow = z.infer<typeof insertMemberFollowSchema>;
export type MemberFollow = typeof memberFollowsTable.$inferSelect;
