import { and, eq, gte } from "drizzle-orm";
import { db, signalsTable } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { sendWeeklyOpsDigest } from "../utils/emailNotifications.js";

/**
 * Weekly Sunday ops digest to seauinnovations@gmail.com — see
 * sendWeeklyOpsDigest's doc comment in emailNotifications.ts for what it
 * contains. The daily day-trade digest does NOT live here — it fires
 * directly at the end of signalScanner.ts's runDayTradeScan, since it needs
 * that specific run's inserted rows rather than a wall-clock-scheduled
 * re-query. This file exists only because the weekly digest genuinely needs
 * its own schedule, decoupled from any single scan.
 *
 * Caveat shared with signalScanner.ts's schedulers: this is a wall-clock-
 * *aligned* in-process timer (it computes ms until the next Sunday and fires
 * there), not a real cron — a redeploy between now and the next Sunday
 * resets and recomputes that target, so it will still land close to Sunday,
 * but a redeploy that happens to land exactly during the digest's send
 * window could shift it by a few minutes. Good enough for a weekly ops
 * email; not something to build a compliance deadline around.
 *
 * signalsTable has no separate "status changed at" timestamp — only
 * createdAt. So "went Active this past week" here is approximated as
 * "status is currently Active AND createdAt falls in the past 7 days" —
 * this correctly captures the common case (a signal admin-created and
 * activated around the same time, or an auto signal promoted to Active
 * within days of being scanned) but will miss an old Watching signal that
 * sat for weeks before finally being promoted. A dedicated
 * statusChangedAt column would fix this precisely, but that's a schema
 * migration left for later rather than bundled into this feature (this app
 * currently has an unrelated pending migration blocker — see the Dockerfile/
 * drizzle-kit push notes from the last deploy fix).
 */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DIGEST_HOUR_UTC = 13; // ~8-9am US Eastern, a reasonable "start of week" send time
let weeklyDigestSchedulerStarted = false;

function msUntilNextSundayAt(hourUtc: number): number {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(hourUtc, 0, 0, 0);
  const daysUntilSunday = (7 - target.getUTCDay()) % 7; // getUTCDay(): Sunday = 0
  target.setUTCDate(target.getUTCDate() + daysUntilSunday);
  if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 7);
  return target.getTime() - now.getTime();
}

async function runWeeklyOpsDigest(): Promise<void> {
  logger.info("Weekly ops digest starting");
  try {
    const cutoff = new Date(Date.now() - WEEK_MS);
    const [activeThisWeek, newWatching] = await Promise.all([
      db
        .select({
          asset: signalsTable.asset, market: signalsTable.market, sector: signalsTable.sector,
          direction: signalsTable.direction, style: signalsTable.style, status: signalsTable.status,
          isOption: signalsTable.isOption, contract: signalsTable.contract, entry: signalsTable.entry, target: signalsTable.target,
        })
        .from(signalsTable)
        .where(and(eq(signalsTable.status, "Active"), gte(signalsTable.createdAt, cutoff))),
      db
        .select({
          asset: signalsTable.asset, market: signalsTable.market, sector: signalsTable.sector,
          direction: signalsTable.direction, style: signalsTable.style, status: signalsTable.status,
          isOption: signalsTable.isOption, contract: signalsTable.contract, entry: signalsTable.entry, target: signalsTable.target,
        })
        .from(signalsTable)
        .where(and(eq(signalsTable.status, "Watching"), eq(signalsTable.source, "auto"), gte(signalsTable.createdAt, cutoff))),
    ]);

    await sendWeeklyOpsDigest({ activeThisWeek, newWatching });
    logger.info(
      { activeCount: activeThisWeek.length, watchingCount: newWatching.length },
      "Weekly ops digest sent",
    );
  } catch (err) {
    logger.error({ err }, "Weekly ops digest failed");
  }
}

export function startWeeklyOpsDigestScheduler(): void {
  if (weeklyDigestSchedulerStarted) return;
  weeklyDigestSchedulerStarted = true;

  const firstDelay = msUntilNextSundayAt(DIGEST_HOUR_UTC);
  logger.info({ firstRunInMs: firstDelay }, "Weekly ops digest scheduler started");
  setTimeout(() => {
    void runWeeklyOpsDigest();
    setInterval(() => {
      void runWeeklyOpsDigest();
    }, WEEK_MS);
  }, firstDelay);
}

startWeeklyOpsDigestScheduler();
