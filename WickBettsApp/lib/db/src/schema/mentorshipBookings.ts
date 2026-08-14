import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const mentorshipBookingStatusEnum = pgEnum("mentorship_booking_status", [
  "confirmed",
  "cancelled",
]);

export const mentorshipBookingsTable = pgTable("mentorship_bookings", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  /** Human-readable day label, e.g. "MON" */
  day: text("day").notNull(),
  /** ISO calendar date for the session, e.g. "2026-08-17" */
  sessionDate: text("session_date").notNull(),
  /** Time slot label, e.g. "10:00 AM" */
  slot: text("slot").notNull(),
  status: mentorshipBookingStatusEnum("status").notNull().default("confirmed"),
  /** Set once the reminder email has gone out, so the reminder scheduler never sends it twice. */
  reminderSentAt: timestamp("reminder_sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMentorshipBookingSchema = createInsertSchema(mentorshipBookingsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertMentorshipBooking = z.infer<typeof insertMentorshipBookingSchema>;
export type MentorshipBooking = typeof mentorshipBookingsTable.$inferSelect;
