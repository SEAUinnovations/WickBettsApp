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
