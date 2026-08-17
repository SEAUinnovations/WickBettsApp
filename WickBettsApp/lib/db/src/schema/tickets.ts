import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * Technical-support tickets submitted from the "Contact us" screen. These are
 * strictly for technical difficulties with the app/website (login, billing,
 * bugs, broken features) — not a general feedback or trading-advice channel.
 *
 * Every submitted ticket is both (a) emailed to seauinnovations@gmail.com via
 * the existing Resend transport (see utils/emailNotifications.ts) and
 * (b) persisted here so it still shows up in the admin panel even if the
 * email bounces, is missed, or Resend isn't configured in a given environment.
 */
export const ticketStatusEnum = pgEnum("ticket_status", ["open", "resolved"]);

export const supportTicketsTable = pgTable("support_tickets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  /** Snapshot of the submitter's email at ticket time, so the row is still
   *  readable/contactable even if the user's account is later removed. */
  userEmail: text("user_email").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: ticketStatusEnum("status").notNull().default("open"),
  /** Set once the notification email to support was successfully sent. */
  emailSentAt: timestamp("email_sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSupportTicketSchema = createInsertSchema(supportTicketsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type SupportTicket = typeof supportTicketsTable.$inferSelect;
