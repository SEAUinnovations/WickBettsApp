import { randomUUID } from "crypto";
import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { db, usersTable, subscriptionsTable, notificationsTable } from "../lib/db.js";
import { eq, and, isNotNull, or } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const expo = new Expo();

export interface SignalSummary {
  asset: string;
  direction: string;
  market: string;
  isOption: boolean;
  optionType?: string | null;
}

/**
 * Fan out an Expo push notification to every subscribed member who has:
 *   - a registered Expo push token
 *   - notifySignals = true
 *   - an active or trialing subscription
 *
 * This is designed to be called as fire-and-forget after a signal is published.
 * It never throws — errors are logged and suppressed so the signal publish
 * response is never delayed or blocked.
 */
export async function fanOutSignalNotification(signal: SignalSummary): Promise<void> {
  const typeLabel = signal.isOption
    ? ` ${signal.optionType ?? "Option"}`
    : "";
  const title = `New ${signal.direction}${typeLabel}: ${signal.asset}`;
  const body = `${signal.market} · Tap to see the full setup`;

  // Persist to the in-app notification feed (the bell in
  // components/WickUI.tsx's Header) regardless of whether anyone has a
  // registered push token — this is what makes the bell show every alert
  // even for members without OS push permissions enabled, or on web, not
  // just whoever happens to get the device push below.
  try {
    await db.insert(notificationsTable).values({
      id: randomUUID(),
      type: "signal",
      title,
      body,
      data: JSON.stringify({
        asset: signal.asset,
        direction: signal.direction,
        market: signal.market,
        isOption: signal.isOption,
        optionType: signal.optionType ?? null,
      }),
    });
  } catch (err) {
    logger.error({ err }, "Failed to record in-app notification for signal");
  }

  try {
    // Fetch eligible recipients in a single query
    const rows = await db
      .select({ pushToken: usersTable.pushToken, userId: usersTable.id })
      .from(usersTable)
      .innerJoin(
        subscriptionsTable,
        eq(subscriptionsTable.userId, usersTable.id),
      )
      .where(
        and(
          or(
            eq(subscriptionsTable.status, "active"),
            eq(subscriptionsTable.status, "trialing"),
          ),
          isNotNull(usersTable.pushToken),
          eq(usersTable.notifySignals, true),
        ),
      );

    const validTokens = rows
      .map((r) => r.pushToken)
      .filter((t): t is string => !!t && Expo.isExpoPushToken(t));

    if (validTokens.length === 0) {
      logger.debug("fanOutSignal: no registered push tokens to notify");
      return;
    }

    const messages: ExpoPushMessage[] = validTokens.map((token) => ({
      to: token,
      sound: "default" as const,
      title,
      body,
      data: { type: "signal", asset: signal.asset },
      priority: "high" as const,
    }));

    // Expo recommends sending in chunks of ≤ 100 messages
    const chunks = expo.chunkPushNotifications(messages);
    const invalidTokens: string[] = [];

    for (const chunk of chunks) {
      let tickets;
      try {
        tickets = await expo.sendPushNotificationsAsync(chunk);
      } catch (chunkErr) {
        logger.error({ err: chunkErr }, "Expo chunk send failed — skipping chunk");
        continue;
      }

      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        if (ticket.status === "error") {
          const errCode = (ticket as { details?: { error?: string } }).details?.error;
          if (errCode === "DeviceNotRegistered") {
            const token = Array.isArray(chunk[i]?.to) ? chunk[i].to[0] : chunk[i]?.to;
            if (typeof token === "string") invalidTokens.push(token);
          }
        }
      }
    }

    logger.info({ recipientCount: validTokens.length }, "Signal push notifications sent");

    // Clear stale / deregistered tokens (best-effort, non-blocking)
    for (const token of invalidTokens) {
      void db
        .update(usersTable)
        .set({ pushToken: null, updatedAt: new Date() })
        .where(eq(usersTable.pushToken, token))
        .catch((err) => logger.warn({ err, token }, "Failed to clear invalid push token"));
    }
  } catch (err) {
    // Non-critical path — log but never propagate so signal publish always succeeds
    logger.error({ err }, "Signal push notification fan-out failed");
  }
}

export interface NewsSummary {
  headline: string;
  summary: string;
  category: string;
  url: string;
  source: string;
}

/**
 * News counterpart to fanOutSignalNotification above — same shape, same
 * fire-and-forget contract, but gated on notifyNews instead of
 * notifySignals. Called from routes/news.ts's cache-refresh cycle, once per
 * newly-seen article that isMarketImpacting() flags (see that file) — never
 * for the full 40-article feed, only the handful per day that actually
 * clear the bar, matching the "ONLY market impacting" ask.
 *
 * Expo push content (title/body) is the only part of a push notification
 * this app controls end to end — there's no custom notification-channel
 * color configured on the client (see AuthContext.tsx's push registration),
 * so unlike the email version below, a push can't carry the purple/black
 * brand treatment itself; the OS renders it with the app's own icon. The
 * in-app alert row (bell → notifications.tsx) and the email are where the
 * purple/black branding actually shows.
 */
export async function fanOutNewsNotification(article: NewsSummary): Promise<void> {
  const title = `${article.category} · ${article.headline}`;
  const body = article.summary || `via ${article.source} · Tap to read more`;

  // Same as fanOutSignalNotification: always persist to the in-app feed,
  // independent of whether anyone has a live push token.
  try {
    await db.insert(notificationsTable).values({
      id: randomUUID(),
      type: "news",
      title,
      body,
      data: JSON.stringify({
        url: article.url,
        category: article.category,
        source: article.source,
      }),
    });
  } catch (err) {
    logger.error({ err }, "Failed to record in-app notification for news");
  }

  try {
    const rows = await db
      .select({ pushToken: usersTable.pushToken, userId: usersTable.id })
      .from(usersTable)
      .innerJoin(
        subscriptionsTable,
        eq(subscriptionsTable.userId, usersTable.id),
      )
      .where(
        and(
          or(
            eq(subscriptionsTable.status, "active"),
            eq(subscriptionsTable.status, "trialing"),
          ),
          isNotNull(usersTable.pushToken),
          eq(usersTable.notifyNews, true),
        ),
      );

    const validTokens = rows
      .map((r) => r.pushToken)
      .filter((t): t is string => !!t && Expo.isExpoPushToken(t));

    if (validTokens.length === 0) {
      logger.debug("fanOutNewsNotification: no registered push tokens to notify");
      return;
    }

    const messages: ExpoPushMessage[] = validTokens.map((token) => ({
      to: token,
      sound: "default" as const,
      title,
      body,
      data: { type: "news", url: article.url },
      priority: "high" as const,
    }));

    const chunks = expo.chunkPushNotifications(messages);
    const invalidTokens: string[] = [];

    for (const chunk of chunks) {
      let tickets;
      try {
        tickets = await expo.sendPushNotificationsAsync(chunk);
      } catch (chunkErr) {
        logger.error({ err: chunkErr }, "Expo chunk send failed — skipping chunk");
        continue;
      }

      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        if (ticket.status === "error") {
          const errCode = (ticket as { details?: { error?: string } }).details?.error;
          if (errCode === "DeviceNotRegistered") {
            const token = Array.isArray(chunk[i]?.to) ? chunk[i].to[0] : chunk[i]?.to;
            if (typeof token === "string") invalidTokens.push(token);
          }
        }
      }
    }

    logger.info({ recipientCount: validTokens.length }, "News push notifications sent");

    for (const token of invalidTokens) {
      void db
        .update(usersTable)
        .set({ pushToken: null, updatedAt: new Date() })
        .where(eq(usersTable.pushToken, token))
        .catch((err) => logger.warn({ err, token }, "Failed to clear invalid push token"));
    }
  } catch (err) {
    logger.error({ err }, "News push notification fan-out failed");
  }
}
