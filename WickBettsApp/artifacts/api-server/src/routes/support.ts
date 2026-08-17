import { Router, type Request, type Response } from "express";
import { db, supportTicketsTable } from "../lib/db.js";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { sendSupportTicketEmail } from "../utils/emailNotifications.js";

const SUBJECT_MAX = 150;
const MESSAGE_MAX = 4000;

const router = Router();

// POST /api/support/tickets — submit a technical-support ticket.
// Any authenticated user can submit one, regardless of subscription plan —
// this is the "something's broken" channel, not a paid feature.
router.post("/tickets", requireAuth, async (req: Request, res: Response) => {
  const { subject, message } = req.body as { subject?: string; message?: string };

  const cleanSubject = (subject ?? "").trim();
  const cleanMessage = (message ?? "").trim();

  if (!cleanSubject) {
    res.status(400).json({ error: "Please add a short subject for your issue." });
    return;
  }
  if (!cleanMessage) {
    res.status(400).json({ error: "Please describe the issue you're running into." });
    return;
  }
  if (cleanSubject.length > SUBJECT_MAX) {
    res.status(400).json({ error: `Subject must be ${SUBJECT_MAX} characters or fewer.` });
    return;
  }
  if (cleanMessage.length > MESSAGE_MAX) {
    res.status(400).json({ error: `Message must be ${MESSAGE_MAX} characters or fewer.` });
    return;
  }

  const user = req.dbUser!;
  const ticket = {
    id: randomUUID(),
    userId: user.id,
    userEmail: user.email,
    subject: cleanSubject,
    message: cleanMessage,
    status: "open" as const,
  };

  try {
    await db.insert(supportTicketsTable).values(ticket);
  } catch (err) {
    logger.error(err, "Failed to save support ticket");
    res.status(500).json({ error: "Could not submit your ticket. Please try again." });
    return;
  }

  // Ticket is already durably saved above — email delivery is best-effort on
  // top of that, so a Resend outage never loses the report. sendSupportTicketEmail
  // never throws; we just record whether it actually went out.
  const emailed = await sendSupportTicketEmail(ticket);
  if (emailed) {
    try {
      await db.update(supportTicketsTable).set({ emailSentAt: new Date() }).where(eq(supportTicketsTable.id, ticket.id));
    } catch (err) {
      logger.warn(err, "Support ticket saved and emailed, but failed to record emailSentAt");
    }
  }

  logger.info({ ticketId: ticket.id, userId: user.id, emailed }, "Support ticket submitted");
  res.status(201).json({ ticket });
});

// GET /api/support/tickets — the current member's own submitted tickets, so
// the Contact us screen can show them what they've already reported and its
// status, instead of feeling like a message sent into a void.
router.get("/tickets", requireAuth, async (req: Request, res: Response) => {
  const user = req.dbUser!;
  try {
    const tickets = await db
      .select()
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.userId, user.id))
      .orderBy(desc(supportTicketsTable.createdAt));
    res.json({ tickets });
  } catch (err) {
    logger.error(err, "Failed to fetch member support tickets");
    res.status(500).json({ error: "Could not load your tickets." });
  }
});

export default router;
