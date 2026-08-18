import { db, usersTable, subscriptionsTable } from "../lib/db.js";
import { eq, and, or } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import type { SignalSummary } from "./pushNotifications.js";

// Email delivery via Resend's plain HTTP API (https://resend.com/docs/api-reference/emails/send-email).
// Deliberately NOT the `resend` npm package — the Docker runtime stage only ships
// `dist` + the already-locked node_modules, so any new dependency needs a working
// local `pnpm install` to regenerate pnpm-lock.yaml first (see docs/adr/0005).
// A raw `fetch` against a stable JSON API avoids that entirely, matching the pattern
// already used for the OpenAI-free parts of the codebase (httpHeaders.ts, etc.).
const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";

// Push notifications don't reach members on web (no service worker registered) and
// can silently fail on mobile if the Expo token goes stale. Email is the reliable
// fallback channel — see docs/adr for the "why email" reasoning captured alongside
// this change.
const FROM_ADDRESS = process.env.EMAIL_FROM || "Wick Betts Alerts <alerts@wickbetts.app>";
const APP_ORIGIN = process.env.APP_ORIGIN || "https://wickbetts.app";

function isConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendBatch(emails: EmailPayload[]): Promise<void> {
  if (!isConfigured()) {
    logger.warn(
      { count: emails.length },
      "RESEND_API_KEY is not configured — skipping email notification send. Add it in Railway's service variables to enable email alerts.",
    );
    return;
  }
  if (emails.length === 0) return;

  // Resend's batch endpoint accepts up to 100 messages per call.
  const CHUNK_SIZE = 100;
  for (let i = 0; i < emails.length; i += CHUNK_SIZE) {
    const chunk = emails.slice(i, i + CHUNK_SIZE).map((e) => ({
      from: FROM_ADDRESS,
      to: [e.to],
      subject: e.subject,
      html: e.html,
      text: e.text,
    }));

    try {
      const res = await fetch(RESEND_BATCH_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        logger.error({ status: res.status, body }, "Resend batch email send failed");
        continue;
      }

      logger.info({ count: chunk.length }, "Email notifications sent");
    } catch (err) {
      logger.error({ err }, "Resend batch email request threw");
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function wrapHtml(title: string, bodyHtml: string, ctaLabel: string, ctaPath: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0b0f14;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
    <table role="presentation" width="100%" style="background:#0b0f14;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" style="background:#131a22;border-radius:12px;overflow:hidden;">
          <tr><td style="padding:24px 28px 0 28px;">
            <div style="color:#5eead4;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Wick Betts</div>
            <h1 style="color:#f4f7f9;font-size:20px;margin:12px 0 4px 0;">${escapeHtml(title)}</h1>
          </td></tr>
          <tr><td style="padding:8px 28px 24px 28px;color:#c7d0d9;font-size:14px;line-height:1.6;">
            ${bodyHtml}
            <div style="margin-top:20px;">
              <a href="${APP_ORIGIN}${ctaPath}" style="display:inline-block;background:#5eead4;color:#08161a;font-weight:700;font-size:14px;padding:10px 18px;border-radius:8px;text-decoration:none;">${escapeHtml(ctaLabel)}</a>
            </div>
          </td></tr>
          <tr><td style="padding:16px 28px 24px 28px;border-top:1px solid #1f2833;">
            <div style="color:#6b7684;font-size:12px;">You're receiving this because email alerts are enabled in your Wick Betts notification settings.</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

/**
 * Email counterpart to fanOutSignalNotification (pushNotifications.ts). Sends to
 * every subscribed member with notifySignals = true and a verified email, regardless
 * of whether they also have a working push token — so members using the web app
 * (where push isn't available) or with a stale mobile token still get alerted.
 * Fire-and-forget: never throws, errors are logged and suppressed.
 */
export async function fanOutSignalEmail(signal: SignalSummary): Promise<void> {
  try {
    const rows = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .innerJoin(subscriptionsTable, eq(subscriptionsTable.userId, usersTable.id))
      .where(
        and(
          or(eq(subscriptionsTable.status, "active"), eq(subscriptionsTable.status, "trialing")),
          eq(usersTable.notifySignals, true),
        ),
      );

    if (rows.length === 0) {
      logger.debug("fanOutSignalEmail: no eligible recipients");
      return;
    }

    const typeLabel = signal.isOption ? ` ${signal.optionType ?? "Option"}` : "";
    const subject = `New ${signal.direction}${typeLabel}: ${signal.asset}`;
    const bodyHtml = `<p>A new <strong>${escapeHtml(signal.direction)}${escapeHtml(typeLabel)}</strong> setup just went live on <strong>${escapeHtml(signal.asset)}</strong> (${escapeHtml(signal.market)}).</p><p>Open the app for the full entry, target, stop, and risk notes.</p>`;
    const text = `New ${signal.direction}${typeLabel}: ${signal.asset}\n${signal.market} — open the app to see the full setup.`;
    const html = wrapHtml(subject, bodyHtml, "View signal", "/signals");

    const seen = new Set<string>();
    const emails: EmailPayload[] = [];
    for (const r of rows) {
      if (!r.email || seen.has(r.email)) continue;
      seen.add(r.email);
      emails.push({ to: r.email, subject, html, text });
    }

    await sendBatch(emails);
  } catch (err) {
    logger.error({ err }, "Signal email fan-out failed");
  }
}

/**
 * Email alert for auto-scanner "major news" flags — gated on notifyNews rather than
 * notifySignals, matching the separate opt-in already exposed in settings.
 */
export async function fanOutNewsEmail(alert: {
  asset: string;
  market: string;
  note: string;
}): Promise<void> {
  try {
    const rows = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .innerJoin(subscriptionsTable, eq(subscriptionsTable.userId, usersTable.id))
      .where(
        and(
          or(eq(subscriptionsTable.status, "active"), eq(subscriptionsTable.status, "trialing")),
          eq(usersTable.notifyNews, true),
        ),
      );

    if (rows.length === 0) {
      logger.debug("fanOutNewsEmail: no eligible recipients");
      return;
    }

    const subject = `Major news flag: ${alert.asset}`;
    const bodyHtml = `<p>A news event was flagged on <strong>${escapeHtml(alert.asset)}</strong> (${escapeHtml(alert.market)}) tied to a live setup.</p><p>${escapeHtml(alert.note)}</p>`;
    const text = `Major news flag: ${alert.asset}\n${alert.note}`;
    const html = wrapHtml(subject, bodyHtml, "View details", "/signals");

    const seen = new Set<string>();
    const emails: EmailPayload[] = [];
    for (const r of rows) {
      if (!r.email || seen.has(r.email)) continue;
      seen.add(r.email);
      emails.push({ to: r.email, subject, html, text });
    }

    await sendBatch(emails);
  } catch (err) {
    logger.error({ err }, "News email fan-out failed");
  }
}

/** "2026-08-17" -> "Monday, August 17" — used by the mentorship emails below. */
function formatSessionDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

interface MentorshipSessionSummary {
  sessionDate: string; // ISO date, e.g. "2026-08-17"
  slot: string; // e.g. "10:00 AM"
}

/** Fired right after a booking is confirmed (routes/mentorship.ts POST /bookings). */
export async function sendMentorshipBookingConfirmation(email: string, session: MentorshipSessionSummary): Promise<void> {
  try {
    const when = `${formatSessionDate(session.sessionDate)} at ${session.slot} Central`;
    const subject = `Confirmed: your mentorship session on ${when}`;
    const bodyHtml = `<p>Your one-hour mentorship session is confirmed for <strong>${escapeHtml(when)}</strong>.</p><p>We'll send a reminder the day before. Need to change plans? You can cancel or rebook anytime from the Mentorship tab.</p>`;
    const text = `Your mentorship session is confirmed for ${when}.\nWe'll send a reminder the day before. You can cancel or rebook anytime from the Mentorship tab.`;
    const html = wrapHtml(subject, bodyHtml, "View booking", "/mentorship");
    await sendBatch([{ to: email, subject, html, text }]);
  } catch (err) {
    logger.error({ err }, "Mentorship booking confirmation email failed");
  }
}

/** Fired by the reminder scheduler (services/mentorshipReminders.ts) roughly a day out from the session. */
export async function sendMentorshipReminder(email: string, session: MentorshipSessionSummary): Promise<void> {
  try {
    const when = `${formatSessionDate(session.sessionDate)} at ${session.slot} Central`;
    const subject = `Reminder: mentorship session tomorrow at ${session.slot}`;
    const bodyHtml = `<p>This is a reminder that your one-hour mentorship session is coming up: <strong>${escapeHtml(when)}</strong>.</p><p>Come with real setups or questions — the more specific, the more useful the hour is.</p>`;
    const text = `Reminder: your mentorship session is coming up on ${when}.\nCome with real setups or questions — the more specific, the more useful the hour is.`;
    const html = wrapHtml(subject, bodyHtml, "View booking", "/mentorship");
    await sendBatch([{ to: email, subject, html, text }]);
  } catch (err) {
    logger.error({ err }, "Mentorship reminder email failed");
  }
}

/** Fired when a member cancels a booking (routes/mentorship.ts DELETE /bookings/:id). */
export async function sendMentorshipCancellation(email: string, session: MentorshipSessionSummary): Promise<void> {
  try {
    const when = `${formatSessionDate(session.sessionDate)} at ${session.slot} Central`;
    const subject = `Cancelled: your mentorship session on ${when}`;
    const bodyHtml = `<p>Your mentorship session for <strong>${escapeHtml(when)}</strong> has been cancelled.</p><p>You can book a new session anytime from the Mentorship tab.</p>`;
    const text = `Your mentorship session for ${when} has been cancelled.\nYou can book a new session anytime from the Mentorship tab.`;
    const html = wrapHtml(subject, bodyHtml, "Book a session", "/mentorship");
    await sendBatch([{ to: email, subject, html, text }]);
  } catch (err) {
    logger.error({ err }, "Mentorship cancellation email failed");
  }
}

/**
 * Fired right after a member requests a slot (routes/mentorship.ts POST
 * /bookings) — the booking lands as "pending", not "confirmed", so this is
 * deliberately softer language than sendMentorshipBookingConfirmation: it
 * sets the expectation that an admin still needs to confirm the time before
 * it's actually on the calendar.
 */
export async function sendMentorshipRequestReceived(email: string, session: MentorshipSessionSummary): Promise<void> {
  try {
    const when = `${formatSessionDate(session.sessionDate)} at ${session.slot} Central`;
    const subject = `Request received: ${when}`;
    const bodyHtml = `<p>Your request for a one-hour mentorship session on <strong>${escapeHtml(when)}</strong> has been received and is awaiting confirmation.</p><p>We'll email you as soon as it's confirmed — usually within a day. That time slot is now held for you in the meantime.</p>`;
    const text = `Your mentorship session request for ${when} has been received and is awaiting confirmation.\nWe'll email you as soon as it's confirmed. That time slot is now held for you in the meantime.`;
    const html = wrapHtml(subject, bodyHtml, "View request", "/mentorship");
    await sendBatch([{ to: email, subject, html, text }]);
  } catch (err) {
    logger.error({ err }, "Mentorship request-received email failed");
  }
}

/** Fired when an admin confirms a pending request (routes/admin.ts PATCH /mentorship-requests/:id). */
export async function sendMentorshipRequestConfirmed(email: string, session: MentorshipSessionSummary): Promise<void> {
  return sendMentorshipBookingConfirmation(email, session);
}

/** Fired when an admin declines a pending request (routes/admin.ts PATCH /mentorship-requests/:id). */
export async function sendMentorshipDeclined(email: string, session: MentorshipSessionSummary): Promise<void> {
  try {
    const when = `${formatSessionDate(session.sessionDate)} at ${session.slot} Central`;
    const subject = `Couldn't confirm: ${when}`;
    const bodyHtml = `<p>Unfortunately your requested mentorship session for <strong>${escapeHtml(when)}</strong> couldn't be confirmed.</p><p>That time slot is now open again — head back to the Mentorship tab to pick another time.</p>`;
    const text = `Your requested mentorship session for ${when} couldn't be confirmed.\nHead back to the Mentorship tab to pick another time.`;
    const html = wrapHtml(subject, bodyHtml, "Pick another time", "/mentorship");
    await sendBatch([{ to: email, subject, html, text }]);
  } catch (err) {
    logger.error({ err }, "Mentorship declined email failed");
  }
}

const SUPPORT_INBOX = "seauinnovations@gmail.com";

/**
 * Fired alongside sendMentorshipRequestReceived — notifies the admin inbox
 * that a new mentorship request is waiting for a decision, mirroring
 * sendSupportTicketEmail's pattern below. Best-effort only: the request
 * itself is durably saved in mentorship_bookings regardless of whether this
 * send succeeds, and it's always visible in the admin Mentorship requests
 * panel either way.
 */
export async function sendMentorshipRequestAdminNotice(request: {
  memberEmail: string;
  session: MentorshipSessionSummary;
}): Promise<void> {
  if (!isConfigured()) {
    logger.warn({ memberEmail: request.memberEmail }, "RESEND_API_KEY is not configured — mentorship admin-notice email skipped (request is still saved).");
    return;
  }
  try {
    const when = `${formatSessionDate(request.session.sessionDate)} at ${request.session.slot} Central`;
    const subject = `[Wick Betts] New mentorship request: ${when}`;
    const bodyHtml = `<p>New mentorship session request from <strong>${escapeHtml(request.memberEmail)}</strong> for <strong>${escapeHtml(when)}</strong>.</p><p>Confirm or decline it from the admin Mentorship requests panel.</p>`;
    const text = `New mentorship session request from ${request.memberEmail} for ${when}.\nConfirm or decline it from the admin Mentorship requests panel.`;
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [SUPPORT_INBOX],
        reply_to: request.memberEmail,
        subject,
        html: wrapHtml(subject, bodyHtml, "Review request", "/admin/mentorship"),
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error({ status: res.status, body }, "Mentorship request admin-notice email failed");
    }
  } catch (err) {
    logger.error({ err }, "Mentorship request admin-notice email threw");
  }
}

/**
 * Fired the moment a member submits a technical-support ticket from the
 * "Contact us" screen (routes/support.ts POST /tickets). Always notifies the
 * fixed support inbox, not a per-user recipient — the ticket itself is also
 * persisted in `support_tickets` regardless of whether this send succeeds, so
 * a missed/bounced email never loses the report (see admin/tickets.tsx).
 * Returns whether the send actually went out, so the route can record
 * emailSentAt accurately instead of always assuming success.
 */
export async function sendSupportTicketEmail(ticket: {
  id: string;
  userEmail: string;
  subject: string;
  message: string;
}): Promise<boolean> {
  if (!isConfigured()) {
    logger.warn({ ticketId: ticket.id }, "RESEND_API_KEY is not configured — support ticket email skipped (ticket is still saved).");
    return false;
  }
  try {
    const subject = `[Wick Betts Support] ${ticket.subject}`;
    const bodyHtml = `<p>New technical-support ticket from <strong>${escapeHtml(ticket.userEmail)}</strong>.</p><p style="white-space:pre-wrap;">${escapeHtml(ticket.message)}</p><p style="color:#6b7684;font-size:12px;">Ticket ID: ${escapeHtml(ticket.id)}</p>`;
    const text = `New technical-support ticket from ${ticket.userEmail}\n\n${ticket.message}\n\nTicket ID: ${ticket.id}`;
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [SUPPORT_INBOX],
        reply_to: ticket.userEmail,
        subject,
        html: bodyHtml,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error({ status: res.status, body, ticketId: ticket.id }, "Support ticket email send failed");
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err, ticketId: ticket.id }, "Support ticket email request threw");
    return false;
  }
}

/** Direct single-recipient send, used outside the fan-out paths (e.g. future
 *  account-level notices). Kept small and generic so it doesn't need its own
 *  ADR entry — same transport as the two fan-out helpers above. */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  if (!isConfigured()) {
    logger.warn({ to: payload.to }, "RESEND_API_KEY is not configured — skipping single email send.");
    return;
  }
  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error({ status: res.status, body }, "Resend single email send failed");
    }
  } catch (err) {
    logger.error({ err }, "Resend single email request threw");
  }
}
