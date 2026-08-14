import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { communityPostsTable } from "./communityPosts";

// Reactions are a fixed emoji set (see ALLOWED_REACTIONS in
// routes/community.ts) rather than freeform emoji input — buttons, not a
// picker, per the product ask ("emote buttons on each others messages").
export const communityPostReactionsTable = pgTable(
  "community_post_reactions",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => communityPostsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // One reaction of a given emoji per user per post — re-tapping the same
    // emoji toggles it off (see routes/community.ts's react endpoint)
    // rather than stacking duplicates.
    uniqueIndex("community_post_reactions_post_user_emoji_idx").on(
      table.postId,
      table.userId,
      table.emoji,
    ),
  ],
);

export const insertCommunityPostReactionSchema = createInsertSchema(communityPostReactionsTable).omit({
  createdAt: true,
});
export type InsertCommunityPostReaction = z.infer<typeof insertCommunityPostReactionSchema>;
export type CommunityPostReaction = typeof communityPostReactionsTable.$inferSelect;
