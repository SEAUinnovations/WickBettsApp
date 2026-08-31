import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * The in-app alert feed shown behind the notification bell across the app
 * (see components/WickUI.tsx's Header). Broadcast-style, not per-user: every
 * row here is visible to every member, same as the signal feed itself — this
 * mirrors the existing Expo push fan-out in utils/pushNotifications.ts
 * (fanOutSignalNotification), which is the current definition of "alert" in
 * this codebase, just persisted so it survives past the OS notification tray
 * and shows up for members without push permissions enabled or on web.
 *
 * Per-user "unread" state is intentionally NOT tracked per-notification —
 * that would need a join table and buys nothing here. Instead each user has
 * a single `lastSeenNotificationsAt` timestamp (see usersTable) and unread
 * count is just "how many rows are newer than that" — see GET /api/notifications.
 */
export const notificationsTable = pgTable("notifications", {
  id: text("id").primaryKey(),
  // 'signal' today (published/activated signals) — kept as free text rather
  // than a pgEnum so new alert types (news, referrals, …) can be added later
  // without a schema migration, only a new fan-out call site.
  type: text("type").notNull().default("signal"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  // Freeform JSON payload the client can use to deep-link (e.g. {"asset":"NVDA"}).
  // Stored as text rather than jsonb to match how the rest of this schema
  // stores structured extras (see signalsTable) and avoid a new PG extension.
  data: text("data"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({
  createdAt: true,
});
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
