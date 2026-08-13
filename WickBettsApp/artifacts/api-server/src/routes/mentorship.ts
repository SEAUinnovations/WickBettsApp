import { Router, type Request, type Response } from "express";
import { db, mentorshipBookingsTable, subscriptionsTable } from "../lib/db.js";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const GRACE_PERIOD_DAYS = 5;

/**
 * Mentorship is sold as its own plan (separate from "signals"/"membership") —
 * unlike signals/community, an active subscription on *any* plan is not
 * enough here. Only members with an active/trialing (or grace-period
 * past_due) subscription specifically on the "mentorship" plan may view or
 * book sessions. Admins bypass for support/testing, mirroring every other
 * gate in this API.
 */
export async function requireMentorshipPlan(req: Request, res: Response, next: () => void) {
  const user = req.dbUser!;
  if (user.role === "admin") {
    next();
    return;
  }

  const subs = await db
    .select()
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.userId, user.id), eq(subscriptionsTable.plan, "mentorship")));

  const now = new Date();
  const graceCutoff = new Date(now.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  const hasAccess = subs.some((s) => {
    if (s.status === "active" || s.status === "trialing") return true;
    if (s.status === "past_due" && s.currentPeriodEnd && new Date(s.currentPeriodEnd) >= graceCutoff) {
      logger.warn(
        { userId: user.id, subscriptionId: s.id, status: s.status },
        "Mentorship access via grace period — past_due webhook may be delayed"
      );
      return true;
    }
    return false;
  });

  if (!hasAccess) {
    logger.warn({ userId: user.id }, "Mentorship gate blocked access — no active mentorship subscription");
    res.status(403).json({ error: "An active Mentorship subscription is required", code: "MENTORSHIP_REQUIRED" });
    return;
  }
  next();
}

const DAY_ORDER = ["MON", "TUE", "WED"] as const;
const WEEKDAY_NUMBER: Record<(typeof DAY_ORDER)[number], number> = { MON: 1, TUE: 2, WED: 3 };
const SLOT_TIMES: Record<(typeof DAY_ORDER)[number], string[]> = {
  MON: ["10:00 AM", "2:00 PM"],
  TUE: ["11:00 AM", "3:00 PM"],
  WED: ["9:00 AM"],
};

function nextDateForWeekday(from: Date, targetDow: number): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const diff = (targetDow - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + (diff === 0 ? 7 : diff)); // always the *next* occurrence, never today
  return d;
}

/** Returns the upcoming Mon/Tue/Wed session slots, computed relative to now. */
function getUpcomingSlots() {
  const now = new Date();
  return DAY_ORDER.map((day) => {
    const date = nextDateForWeekday(now, WEEKDAY_NUMBER[day]);
    const iso = date.toISOString().slice(0, 10);
    return {
      day,
      date: iso,
      dateLabel: String(date.getDate()),
      slots: SLOT_TIMES[day],
    };
  });
}

const router = Router();

// GET /api/mentorship/slots — the upcoming bookable calendar
router.get("/slots", requireAuth, requireMentorshipPlan, (_req: Request, res: Response) => {
  res.json({ days: getUpcomingSlots() });
});

// GET /api/mentorship/bookings — the current member's confirmed upcoming bookings
router.get("/bookings", requireAuth, requireMentorshipPlan, async (req: Request, res: Response) => {
  const user = req.dbUser!;
  try {
    const bookings = await db
      .select()
      .from(mentorshipBookingsTable)
      .where(and(eq(mentorshipBookingsTable.userId, user.id), eq(mentorshipBookingsTable.status, "confirmed")))
      .orderBy(desc(mentorshipBookingsTable.createdAt));
    res.json({ bookings });
  } catch (err) {
    logger.error(err, "Failed to fetch mentorship bookings");
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

// POST /api/mentorship/bookings — confirm a one-hour session
router.post("/bookings", requireAuth, requireMentorshipPlan, async (req: Request, res: Response) => {
  const { day, date, slot } = req.body as { day?: string; date?: string; slot?: string };

  if (!day || !DAY_ORDER.includes(day as (typeof DAY_ORDER)[number])) {
    res.status(400).json({ error: `day must be one of: ${DAY_ORDER.join(", ")}` });
    return;
  }
  if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "date must be an ISO date string (YYYY-MM-DD)" });
    return;
  }
  if (!slot || typeof slot !== "string") {
    res.status(400).json({ error: "slot is required" });
    return;
  }

  const user = req.dbUser!;
  try {
    // Idempotent: if the member already confirmed this exact slot, return it
    // instead of erroring (covers double-tap / retry-after-timeout).
    const existing = await db
      .select()
      .from(mentorshipBookingsTable)
      .where(
        and(
          eq(mentorshipBookingsTable.userId, user.id),
          eq(mentorshipBookingsTable.sessionDate, date),
          eq(mentorshipBookingsTable.slot, slot),
          eq(mentorshipBookingsTable.status, "confirmed")
        )
      )
      .limit(1);
    if (existing.length > 0) {
      res.status(200).json({ booking: existing[0] });
      return;
    }

    const booking = {
      id: randomUUID(),
      userId: user.id,
      day,
      sessionDate: date,
      slot,
      status: "confirmed" as const,
    };
    await db.insert(mentorshipBookingsTable).values(booking);
    logger.info({ bookingId: booking.id, userId: user.id, day, date, slot }, "Mentorship session booked");
    res.status(201).json({ booking });
  } catch (err) {
    logger.error(err, "Failed to create mentorship booking");
    res.status(500).json({ error: "Failed to book session" });
  }
});

// DELETE /api/mentorship/bookings/:id — cancel a booking (owner only)
router.delete("/bookings/:id", requireAuth, requireMentorshipPlan, async (req: Request, res: Response) => {
  const user = req.dbUser!;
  const id = String(req.params.id);
  try {
    const rows = await db.select().from(mentorshipBookingsTable).where(eq(mentorshipBookingsTable.id, id)).limit(1);
    const booking = rows[0];
    if (!booking || booking.userId !== user.id) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    await db
      .update(mentorshipBookingsTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(mentorshipBookingsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    logger.error(err, "Failed to cancel mentorship booking");
    res.status(500).json({ error: "Failed to cancel booking" });
  }
});

export default router;
