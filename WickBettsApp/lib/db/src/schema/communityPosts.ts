import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const communityThreadEnum = pgEnum("community_thread", ["Signals", "News", "Community Chat"]);

export const communityPostsTable = pgTable("community_posts", {
  id: text("id").primaryKey(),
  thread: communityThreadEnum("thread").notNull().default("Community Chat"),
  authorId: text("author_id")
    .notNull()
    .references(() => usersTable.id),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCommunityPostSchema = createInsertSchema(communityPostsTable).omit({
  createdAt: true,
});
export type InsertCommunityPost = z.infer<typeof insertCommunityPostSchema>;
export type CommunityPost = typeof communityPostsTable.$inferSelect;
