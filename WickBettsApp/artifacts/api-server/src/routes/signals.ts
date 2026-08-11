import { Router, type Request, type Response } from "express";
import { db, signalsTable, subscriptionsTable } from "../lib/db.js";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";
import { fanOutSignalNotification } from "../utils/pushNotifications.js";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth.js";

export async function requireActiveSubscription(req: Request, res: Response, next: () => void) {
  const user = req.dbUser!;
  const subs = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, user.id))
    .limit(1);

  const now = new Date();
  const graceCutoff = new Date(now.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  const hasSub = subs.some((s) => {
    if (s.status === "active" || s.status === "trialing") return true;
    // Grace period applies only to `past_due` — this is the Stripe state where a
    // renewal payment failed but may still be retried, and a delayed webhook can
    // leave a member's local record stale while their card is actually charged.
    // Explicitly excluded: `canceled` (deliberate cancellation) and `incomplete`
    // (payment never completed), which must not receive paid content.
    if (s.status === "past_due" && s.currentPeriodEnd && new Date(s.currentPeriodEnd) >= graceCutoff) {
      logger.warn(
        { userId: user.id, subscriptionId: s.id, status: s.status, currentPeriodEnd: s.currentPeriodEnd },
        "Subscription access via grace period — past_due webhook may be delayed"
      );
      return true;
    }
    return false;
  });

  if (!hasSub && user.role !== "admin") {
    logger.warn({ userId: user.id }, "Subscription gate blocked access — no active or grace-period subscription");
    res.status(403).json({ error: "Active subscription required", code: "SUBSCRIPTION_REQUIRED" });
    return;
  }
  next();
}

const router = Router();

// GET /api/signals — member feed (requires auth + active sub)
router.get("/", requireAuth, requireActiveSubscription, async (_req, res) => {
  const signals = await db
    .select()
    .from(signalsTable)
    .orderBy(desc(signalsTable.createdAt))
    .limit(100);
  res.json({ signals });
});

// POST /api/signals — publish a signal (admin only)
router.post("/", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const body = req.body as {
    status?: "Active" | "Watching" | "Closed" | "Stopped" | null;
    asset?: string | null; market?: "Stocks" | "Crypto" | null; direction?: "Long" | "Short" | null;
    entry?: string | null; target?: string | null; stop?: string | null; timeframe?: string | null;
    risk?: string | null; analysis?: string | null; isOption?: boolean | null;
    optionType?: "Call" | "Put" | null; contract?: string | null; expiration?: string | null;
    strike?: string | null; premium?: string | null; bid?: string | null; ask?: string | null;
    impliedVolatility?: string | null; delta?: number | null; gamma?: number | null;
    theta?: number | null; vega?: number | null; openInterest?: string | null;
  };

  if (!body.asset || !body.entry || !body.target || !body.stop || !body.analysis) {
    res.status(400).json({ error: "Missing required signal fields" });
    return;
  }

  const user = req.dbUser!;
  try {
    // Explicit construction so TypeScript can verify required non-null fields.
    // The guard above already ensures asset/entry/target/stop/analysis are
    // non-empty strings; non-null assertions here are therefore safe.
    const signal = {
      id: randomUUID(),
      asset: body.asset!,
      market: body.market ?? "Stocks",
      direction: body.direction ?? "Long",
      status: body.status ?? undefined,
      entry: body.entry!,
      target: body.target!,
      stop: body.stop!,
      timeframe: body.timeframe ?? "Day",
      risk: body.risk ?? undefined,
      analysis: body.analysis!,
      isOption: body.isOption ?? undefined,
      optionType: body.optionType ?? undefined,
      contract: body.contract ?? undefined,
      expiration: body.expiration ?? undefined,
      strike: body.strike ?? undefined,
      premium: body.premium ?? undefined,
      bid: body.bid ?? undefined,
      ask: body.ask ?? undefined,
      impliedVolatility: body.impliedVolatility ?? undefined,
      delta: body.delta ?? undefined,
      gamma: body.gamma ?? undefined,
      theta: body.theta ?? undefined,
      vega: body.vega ?? undefined,
      openInterest: body.openInterest ?? undefined,
      createdBy: user.id,
    };
    await db.insert(signalsTable).values(signal);
    logger.info({ signalId: signal.id, asset: signal.asset }, "Signal published");
    res.status(201).json({ signal });

    // Fire-and-forget push notification fan-out — must not block the response
    void fanOutSignalNotification({
      asset: signal.asset,
      direction: signal.direction,
      market: signal.market,
      isOption: signal.isOption ?? false,
      optionType: signal.optionType ?? null,
    });
  } catch (err) {
    logger.error(err, "Failed to insert signal");
    res.status(500).json({ error: "Failed to publish signal" });
  }
});

// PATCH /api/signals/:id — update a signal (admin only); accepts full or partial body
router.patch("/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const body = req.body as {
    status?: "Active" | "Watching" | "Closed" | "Stopped" | null;
    asset?: string | null; market?: "Stocks" | "Crypto" | null; direction?: "Long" | "Short" | null;
    entry?: string | null; target?: string | null; stop?: string | null; timeframe?: string | null;
    risk?: string | null; analysis?: string | null; isOption?: boolean | null;
    optionType?: "Call" | "Put" | null; contract?: string | null; expiration?: string | null;
    strike?: string | null; premium?: string | null; bid?: string | null; ask?: string | null;
    impliedVolatility?: string | null; delta?: number | null; gamma?: number | null;
    theta?: number | null; vega?: number | null; openInterest?: string | null;
  };

  const validStatus = ["Active", "Watching", "Closed", "Stopped"];
  const validMarket = ["Stocks", "Crypto"];
  const validDirection = ["Long", "Short"];
  const validOptionType = ["Call", "Put"];

  if (body.status != null && !validStatus.includes(body.status)) {
    res.status(400).json({ error: `Invalid status value: ${String(body.status)}` }); return;
  }
  if (body.market != null && !validMarket.includes(body.market)) {
    res.status(400).json({ error: `Invalid market value: ${String(body.market)}` }); return;
  }
  if (body.direction != null && !validDirection.includes(body.direction)) {
    res.status(400).json({ error: `Invalid direction value: ${String(body.direction)}` }); return;
  }
  if (body.optionType != null && !validOptionType.includes(body.optionType)) {
    res.status(400).json({ error: `Invalid optionType value: ${String(body.optionType)}` }); return;
  }
  for (const field of ["delta", "gamma", "theta", "vega"] as const) {
    const val = body[field];
    if (val !== undefined && val !== null && (typeof val !== "number" || !isFinite(val))) {
      res.status(400).json({ error: `${field} must be a finite number or null` }); return;
    }
  }

  const updates: Record<string, unknown> = {};
  const include = (key: string, val: unknown) => { if (val !== undefined) updates[key] = val; };

  include("status", body.status); include("asset", body.asset); include("market", body.market);
  include("direction", body.direction); include("entry", body.entry); include("target", body.target);
  include("stop", body.stop); include("timeframe", body.timeframe); include("risk", body.risk);
  include("analysis", body.analysis); include("isOption", body.isOption);
  include("optionType", body.optionType); include("contract", body.contract);
  include("expiration", body.expiration); include("strike", body.strike);
  include("premium", body.premium); include("bid", body.bid); include("ask", body.ask);
  include("impliedVolatility", body.impliedVolatility); include("delta", body.delta);
  include("gamma", body.gamma); include("theta", body.theta); include("vega", body.vega);
  include("openInterest", body.openInterest);

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  try {
    await db.update(signalsTable).set(updates).where(eq(signalsTable.id, id));
    logger.info({ signalId: id, updates: Object.keys(updates) }, "Signal updated");
    res.json({ ok: true });
  } catch (err) {
    logger.error(err, "Failed to update signal");
    res.status(500).json({ error: "Failed to update signal" });
  }
});

export default router;

const GRACE_PERIOD_DAYS = 5;
