import { Router, type Request, type Response } from "express";
import { db, mentorshipBookingsTable, subscriptionsTable } from "../lib/db.js";
import { eq, and, desc, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { sendMentorshipRequestReceived, sendMentorshipRequestAdminNotice, sendMentorshipCancellation } from "../utils/emailNotifications.js";

// A slot is considered occupied — and therefore excluded from the bookable
// calendar, and blocked from a new request — for as long as a booking on it
// is "pending" or "confirmed". Declining or cancelling a booking removes it
// from this set automatically, freeing the slot back up with no extra logic.
const ACTIVE_STATUSES = ["pending", "confirmed"] as const;

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
// How many upcoming occurrences of each weekday to expose as bookable —
// e.g. 4 gives roughly a month of Mon/Tue/Wed dates to pick from instead of
// just the single nearest one, so the client can render an actual calendar
// of choices rather than three fixed rows.
const WEEKS_AHEAD = 4;

function nextDateForWeekday(from: Date, targetDow: number): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const diff = (targetDow - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + (diff === 0 ? 7 : diff)); // always the *next* occurrence, never today
  return d;
}

/** The Monday (00:00) of the week containing `date` — used to group bookable days into week sections. */
function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0 = Sun .. 6 = Sat
  const diffToMonday = (dow + 6) % 7; // Mon -> 0, Tue -> 1, ... Sun -> 6
  d.setDate(d.getDate() - diffToMonday);
  return d;
}

/**
 * Every currently-occupied date+slot combination — anyone with a "pending"
 * or "confirmed" booking counts as occupying that slot, since this is a
 * one-on-one call and only one person can hold a given time. Keyed as
 * `${sessionDate}|${slot}` for quick lookup while building the calendar.
 */
async function getTakenSlots(): Promise<Set<string>> {
  const rows = await db
    .select({ sessionDate: mentorshipBookingsTable.sessionDate, slot: mentorshipBookingsTable.slot })
    .from(mentorshipBookingsTable)
    .where(inArray(mentorshipBookingsTable.status, ACTIVE_STATUSES));
  return new Set(rows.map((r) => `${r.sessionDate}|${r.slot}`));
}

/**
 * Returns the next `WEEKS_AHEAD` occurrences of each bookable weekday
 * (Mon/Tue/Wed), flattened and sorted into one date-ascending list — the
 * bookable calendar. Each row also carries `weekStart` (that week's Monday,
 * ISO date) so the client can group rows into "This week" / "Week of ..."
 * sections instead of one long flat list. Slots already held by a pending or
 * confirmed booking (anyone's) are filtered out entirely — this is what
 * actually makes the calendar reflect real availability instead of just a
 * static weekly template.
 */
async function getUpcomingSlots() {
  const now = new Date();
  const taken = await getTakenSlots();
  const rows: {
    day: (typeof DAY_ORDER)[number];
    date: string;
    dateLabel: string;
    weekdayLabel: string;
    weekStart: string;
    slots: string[];
  }[] = [];

  for (const day of DAY_ORDER) {
    const first = nextDateForWeekday(now, WEEKDAY_NUMBER[day]);
    for (let i = 0; i < WEEKS_AHEAD; i++) {
      const date = new Date(first);
      date.setDate(date.getDate() + i * 7);
      const dateStr = date.toISOString().slice(0, 10);
      const openSlots = SLOT_TIMES[day].filter((slot) => !taken.has(`${dateStr}|${slot}`));
      if (openSlots.length === 0) continue; // every slot that day is already spoken for
      rows.push({
        day,
        date: dateStr,
        dateLabel: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        weekdayLabel: date.toLocaleDateString("en-US", { weekday: "long" }),
        weekStart: mondayOf(date).toISOString().slice(0, 10),
        slots: openSlots,
      });
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

const router = Router();

// GET /api/mentorship/slots — the upcoming bookable calendar, already
// filtered down to genuinely open times (see getUpcomingSlots).
router.get("/slots", requireAuth, requireMentorshipPlan, async (_req: Request, res: Response) => {
  try {
    res.json({ days: await getUpcomingSlots() });
  } catch (err) {
    logger.error(err, "Failed to build mentorship slot calendar");
    res.status(500).json({ error: "Could not load the mentorship calendar" });
  }
});

// GET /api/mentorship/bookings — the current member's active (pending or
// confirmed) sessions. Declined/cancelled bookings are left out — they are
// not "active" from the member's perspective anymore.
router.get("/bookings", requireAuth, requireMentorshipPlan, async (req: Request, res: Response) => {
  const user = req.dbUser!;
  try {
    const bookings = await db
      .select()
      .from(mentorshipBookingsTable)
      .where(and(eq(mentorshipBookingsTable.userId, user.id), inArray(mentorshipBookingsTable.status, ACTIVE_STATUSES)))
      .orderBy(desc(mentorshipBookingsTable.createdAt));
    res.json({ bookings });
  } catch (err) {
    logger.error(err, "Failed to fetch mentorship bookings");
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

// POST /api/mentorship/bookings — request a one-hour session. Lands as
// "pending", not "confirmed" — an admin has to approve it from the
// Mentorship requests panel before it's an actual scheduled call. See
// lib/db/src/schema/mentorshipBookings.ts for the full status model.
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
    // Idempotent: if this member already has an active (pending or
    // confirmed) request on this exact slot, return it instead of erroring
    // — covers double-tap / retry-after-timeout.
    const ownExisting = await db
      .select()
      .from(mentorshipBookingsTable)
      .where(
        and(
          eq(mentorshipBookingsTable.userId, user.id),
          eq(mentorshipBookingsTable.sessionDate, date),
          eq(mentorshipBookingsTable.slot, slot),
          inArray(mentorshipBookingsTable.status, ACTIVE_STATUSES)
        )
      )
      .limit(1);
    if (ownExisting.length > 0) {
      res.status(200).json({ booking: ownExisting[0] });
      return;
    }

    // Real availability check: reject if *anyone* — not just this member —
    // already holds this exact date+slot with a pending or confirmed
    // booking. This is the actual fix for the double-booking gap: the
    // calendar (GET /slots) already filters these out, but a request can
    // still race in between two members loading the same stale calendar, so
    // this re-check at insert time is what actually prevents the conflict.
    const takenByAnyone = await db
      .select({ id: mentorshipBookingsTable.id })
      .from(mentorshipBookingsTable)
      .where(
        and(
          eq(mentorshipBookingsTable.sessionDate, date),
          eq(mentorshipBookingsTable.slot, slot),
          inArray(mentorshipBookingsTable.status, ACTIVE_STATUSES)
        )
      )
      .limit(1);
    if (takenByAnyone.length > 0) {
      res.status(409).json({ error: "That time is no longer available. Please choose another." });
      return;
    }

    const booking = {
      id: randomUUID(),
      userId: user.id,
      day,
      sessionDate: date,
      slot,
      status: "pending" as const,
    };
    await db.insert(mentorshipBookingsTable).values(booking);
    logger.info({ bookingId: booking.id, userId: user.id, day, date, slot }, "Mentorship session requested — pending admin confirmation");
    res.status(201).json({ booking });

    // Fire-and-forget — the request is already durably saved above, so a
    // failed send here never loses it. Both helpers log and swallow their
    // own errors.
    const session = { sessionDate: date, slot };
    void sendMentorshipRequestReceived(user.email, session);
    void sendMentorshipRequestAdminNotice({ memberEmail: user.email, session });
  } catch (err) {
    logger.error(err, "Failed to create mentorship booking request");
    res.status(500).json({ error: "Failed to request this session" });
  }
});

// DELETE /api/mentorship/bookings/:id — withdraw a request or cancel a
// confirmed session (owner only). Works for either status — freeing the
// slot back up on the calendar either way.
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
    const wasConfirmed = booking.status === "confirmed";
    await db
      .update(mentorshipBookingsTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(mentorshipBookingsTable.id, id));
    res.json({ ok: true });

    // Only worth an email if there was actually a confirmed session to
    // cancel — withdrawing a still-pending request doesn't need one.
    if (wasConfirmed) {
      void sendMentorshipCancellation(user.email, { sessionDate: booking.sessionDate, slot: booking.slot });
    }
  } catch (err) {
    logger.error(err, "Failed to cancel mentorship booking");
    res.status(500).json({ error: "Failed to cancel booking" });
  }
});

export default router;
