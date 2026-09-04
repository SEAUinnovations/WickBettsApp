import { Router, type Request, type Response } from "express";
import { db, signalsTable, subscriptionsTable } from "../lib/db.js";
import { eq, desc, ne, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";
import { fanOutSignalNotification } from "../utils/pushNotifications.js";
import { fanOutSignalEmail, fanOutNewsEmail } from "../utils/emailNotifications.js";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth.js";
import { resolveLogoUrl } from "./market.js";

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

// The Signals tab itself (exact entries/targets/stops/contract detail) is
// NOT included on the base Membership plan — Membership gets community
// access, the Learning tab, trade reviews, and signal-alert EMAILS (see
// fanOutSignalEmail in utils/emailNotifications.ts, which is plan-blind by
// design), but not the live feed of exact calls. Only the "signals" and
// "mentorship" plans (mentorship is sold as "everything in Signals" plus
// more) unlock this feed. This mirrors requireMentorshipPlan in
// mentorship.ts, just with a different target plan set, and is deliberately
// its OWN gate rather than a change to requireActiveSubscription above —
// Community/News/Market/Trade Reviews stay on "any active plan" as before.
const SIGNALS_FEED_PLANS = ["signals", "mentorship"] as const;

export async function requireSignalsPlan(req: Request, res: Response, next: () => void) {
  const user = req.dbUser!;
  if (user.role === "admin") {
    next();
    return;
  }

  const subs = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, user.id));

  const now = new Date();
  const graceCutoff = new Date(now.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  const isEntitled = (s: (typeof subs)[number]) => {
    if (s.status === "active" || s.status === "trialing") return true;
    if (s.status === "past_due" && s.currentPeriodEnd && new Date(s.currentPeriodEnd) >= graceCutoff) return true;
    return false;
  };

  const hasAnyEntitledSub = subs.some(isEntitled);
  const hasSignalsPlan = subs.some((s) => (SIGNALS_FEED_PLANS as readonly string[]).includes(s.plan) && isEntitled(s));

  if (hasSignalsPlan) {
    next();
    return;
  }

  if (!hasAnyEntitledSub) {
    logger.warn({ userId: user.id }, "Signals gate blocked access — no active or grace-period subscription");
    res.status(403).json({ error: "Active subscription required", code: "SUBSCRIPTION_REQUIRED" });
    return;
  }

  // Subscribed, but on a plan that doesn't include the Signals feed
  // (Membership) — a distinct code so the client can show an upgrade
  // prompt instead of the generic "pick a plan" screen.
  logger.warn({ userId: user.id }, "Signals gate blocked access — active subscription does not include the Signals plan");
  res.status(403).json({ error: "Upgrade to Signals to view exact entries, targets, and contract detail.", code: "SIGNALS_PLAN_REQUIRED" });
}

const router = Router();

// GET /api/signals — member feed (requires auth + a Signals-tier
// subscription — see requireSignalsPlan above). "Watching" is an
// auto-generated candidate awaiting admin review (see signalScanner.ts /
// the PATCH handler below) — it must never reach subscribers, only the
// moment it's promoted to "Active" is a live, admin-reviewed call. Admins
// still see every status so they have something to review in the first
// place.
router.get("/", requireAuth, requireSignalsPlan, async (req: Request, res: Response) => {
  const user = req.dbUser!;
  const rows =
    user.role === "admin"
      ? await db.select().from(signalsTable).orderBy(desc(signalsTable.createdAt)).limit(100)
      : await db
          .select()
          .from(signalsTable)
          .where(ne(signalsTable.status, "Watching"))
          .orderBy(desc(signalsTable.createdAt))
          .limit(100);
  // logoUrl is computed on read rather than stored — it's a best-effort
  // lookup (see resolveLogoUrl in routes/market.ts) that should reflect
  // whatever the live ticker/logo mapping knows right now, not whatever it
  // knew at signal-creation time.
  const signals = rows.map((s) => ({ ...s, logoUrl: resolveLogoUrl(s.asset) }));
  res.json({ signals });
});

const VALID_STYLES = ["Day Trade", "Swing", "Buy & Hold", "LEAPS"] as const;
type SignalStyle = (typeof VALID_STYLES)[number];

// Max signals that can be featured in the Community tab's Signals feed at
// once (see communityStarred on signalsTable) — kept small on purpose so
// the feed stays a curated highlight reel, not a second copy of the full
// member feed.
const MAX_COMMUNITY_STARRED = 4;

// GET /api/signals/community-starred — the small (≤4), admin-curated
// "featured in Community" highlight reel. Deliberately gated by
// requireActiveSubscription (any active plan) rather than
// requireSignalsPlan above: Membership subscribers don't get the full
// Signals tab feed, but they DO keep community access, and this curated
// reel is part of Community, not the Signals tab. Excludes "Watching" for
// non-admins for the same reason the main feed does — those are
// auto-generated candidates awaiting review, never meant to reach members.
router.get("/community-starred", requireAuth, requireActiveSubscription, async (req: Request, res: Response) => {
  const user = req.dbUser!;
  const rows = await db
    .select()
    .from(signalsTable)
    .where(
      user.role === "admin"
        ? eq(signalsTable.communityStarred, true)
        : and(eq(signalsTable.communityStarred, true), ne(signalsTable.status, "Watching"))
    )
    .orderBy(desc(signalsTable.createdAt))
    .limit(MAX_COMMUNITY_STARRED);
  const signals = rows.map((s) => ({ ...s, logoUrl: resolveLogoUrl(s.asset) }));
  res.json({ signals });
});

// POST /api/signals — publish a signal (admin only)
router.post("/", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const body = req.body as {
    status?: "Active" | "Watching" | "Closed" | "Stopped" | null;
    style?: SignalStyle | null;
    asset?: string | null; sector?: string | null; market?: "Stocks" | "Crypto" | null; direction?: "Long" | "Short" | null;
    entry?: string | null; target?: string | null; stop?: string | null; timeframe?: string | null;
    risk?: string | null; analysis?: string | null; isOption?: boolean | null;
    optionType?: "Call" | "Put" | null; contract?: string | null; contractAmount?: number | null;
    expiration?: string | null;
    strike?: string | null; premium?: string | null; bid?: string | null; ask?: string | null;
    impliedVolatility?: string | null; delta?: number | null; gamma?: number | null;
    theta?: number | null; vega?: number | null; openInterest?: string | null;
    analysisImageDataUrl?: string | null;
  };

  if (body.contractAmount != null && (typeof body.contractAmount !== "number" || !Number.isFinite(body.contractAmount) || body.contractAmount <= 0)) {
    res.status(400).json({ error: "contractAmount must be a positive number" });
    return;
  }
  if (body.analysisImageDataUrl != null && (typeof body.analysisImageDataUrl !== "string" || !body.analysisImageDataUrl.startsWith("data:image/"))) {
    res.status(400).json({ error: "analysisImageDataUrl must be a base64 image data URL" });
    return;
  }

  const style: SignalStyle = body.style && VALID_STYLES.includes(body.style) ? body.style : "Swing";
  // Buy & Hold is a long-term spot thesis with no hard stop-loss by design
  // (see signalStyleEnum in lib/db/src/schema/signals.ts) — every other
  // style still requires one, same as before this feature existed.
  const stopRequired = style !== "Buy & Hold";

  if (!body.asset || !body.entry || !body.target || !body.analysis || (stopRequired && !body.stop)) {
    res.status(400).json({ error: stopRequired ? "Missing required signal fields" : "Missing required signal fields (stop is optional for Buy & Hold)" });
    return;
  }
  // Day Trade is deliberately excluded from this gate — the auto scanner's
  // Day Trade signals are CME futures contracts (see signalScanner.ts's
  // runDayTradeScan), not stock options, so isOption is false for those.
  // An admin manually creating a Day Trade signal can still set isOption
  // true if they're publishing a genuine 0DTE options call instead.
  if (style === "LEAPS" && !body.isOption) {
    res.status(400).json({ error: "LEAPS signals must be an options contract (isOption: true)" });
    return;
  }
  if (style === "Buy & Hold" && body.isOption) {
    res.status(400).json({ error: "Buy & Hold signals are a spot/equity position, not an options contract" });
    return;
  }

  const user = req.dbUser!;
  try {
    // Explicit construction so TypeScript can verify required non-null fields.
    // The guard above already ensures asset/entry/target/analysis are
    // non-empty strings (and stop too, when required); non-null assertions
    // here are therefore safe.
    const signal = {
      id: randomUUID(),
      asset: body.asset!,
      sector: body.sector?.trim() || undefined,
      market: body.market ?? "Stocks",
      direction: body.direction ?? "Long",
      status: body.status ?? undefined,
      style,
      entry: body.entry!,
      target: body.target!,
      stop: body.stop ?? undefined,
      timeframe: body.timeframe ?? "Day",
      risk: body.risk ?? undefined,
      analysis: body.analysis!,
      isOption: body.isOption ?? undefined,
      optionType: body.optionType ?? undefined,
      contract: body.contract ?? undefined,
      // Contracts is options/LEAPS-only in the UI, but the column always
      // defaults to 1 regardless of isOption — see the schema comment.
      contractAmount: body.contractAmount != null ? Math.round(body.contractAmount) : undefined,
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
      analysisImageDataUrl: body.analysisImageDataUrl ?? undefined,
      createdBy: user.id,
    };
    await db.insert(signalsTable).values(signal);
    logger.info({ signalId: signal.id, asset: signal.asset }, "Signal published");
    res.status(201).json({ signal });

    // Fire-and-forget notification fan-out — must not block the response.
    // Both push and email go out for every published signal; email is the
    // reliable channel since push isn't available on web and can silently
    // fail if a device's Expo token has gone stale.
    const signalSummary = {
      asset: signal.asset,
      direction: signal.direction,
      market: signal.market,
      isOption: signal.isOption ?? false,
      optionType: signal.optionType ?? null,
    };
    void fanOutSignalNotification(signalSummary);
    void fanOutSignalEmail(signalSummary);
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
    style?: SignalStyle | null;
    asset?: string | null; sector?: string | null; market?: "Stocks" | "Crypto" | null; direction?: "Long" | "Short" | null;
    entry?: string | null; target?: string | null; stop?: string | null; timeframe?: string | null;
    risk?: string | null; analysis?: string | null; isOption?: boolean | null;
    optionType?: "Call" | "Put" | null; contract?: string | null; contractAmount?: number | null;
    expiration?: string | null;
    strike?: string | null; premium?: string | null; bid?: string | null; ask?: string | null;
    impliedVolatility?: string | null; delta?: number | null; gamma?: number | null;
    theta?: number | null; vega?: number | null; openInterest?: string | null;
    communityStarred?: boolean | null;
    analysisImageDataUrl?: string | null;
  };

  const validStatus = ["Active", "Watching", "Closed", "Stopped"];
  const validMarket = ["Stocks", "Crypto"];
  const validDirection = ["Long", "Short"];
  const validOptionType = ["Call", "Put"];

  if (body.status != null && !validStatus.includes(body.status)) {
    res.status(400).json({ error: `Invalid status value: ${String(body.status)}` }); return;
  }
  if (body.style != null && !VALID_STYLES.includes(body.style)) {
    res.status(400).json({ error: `Invalid style value: ${String(body.style)}` }); return;
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
  // See the matching comment on the POST handler above — Day Trade is
  // excluded from this gate since the auto scanner's Day Trade signals are
  // futures contracts (isOption: false), not stock options.
  if (body.style === "LEAPS" && body.isOption === false) {
    res.status(400).json({ error: "LEAPS signals must be an options contract (isOption: true)" }); return;
  }
  if (body.style === "Buy & Hold" && body.isOption === true) {
    res.status(400).json({ error: "Buy & Hold signals are a spot/equity position, not an options contract" }); return;
  }
  for (const field of ["delta", "gamma", "theta", "vega"] as const) {
    const val = body[field];
    if (val !== undefined && val !== null && (typeof val !== "number" || !isFinite(val))) {
      res.status(400).json({ error: `${field} must be a finite number or null` }); return;
    }
  }
  if (body.communityStarred != null && typeof body.communityStarred !== "boolean") {
    res.status(400).json({ error: "communityStarred must be a boolean" }); return;
  }
  if (body.contractAmount != null && (typeof body.contractAmount !== "number" || !Number.isFinite(body.contractAmount) || body.contractAmount <= 0)) {
    res.status(400).json({ error: "contractAmount must be a positive number" }); return;
  }
  if (body.analysisImageDataUrl != null && (typeof body.analysisImageDataUrl !== "string" || !body.analysisImageDataUrl.startsWith("data:image/"))) {
    res.status(400).json({ error: "analysisImageDataUrl must be a base64 image data URL" }); return;
  }

  const updates: Record<string, unknown> = {};
  const include = (key: string, val: unknown) => { if (val !== undefined) updates[key] = val; };

  include("status", body.status); include("style", body.style); include("asset", body.asset); include("sector", body.sector); include("market", body.market);
  include("direction", body.direction); include("entry", body.entry); include("target", body.target);
  include("stop", body.stop); include("timeframe", body.timeframe); include("risk", body.risk);
  include("analysis", body.analysis); include("isOption", body.isOption);
  include("optionType", body.optionType); include("contract", body.contract);
  // contractAmount is skipped (not reset) when omitted from the body — only
  // an explicit positive number changes it, same "leave as-is unless given a
  // value" behavior as every other field here. null was already rejected
  // above, so whatever survives to here is a genuine number to round and set.
  include("contractAmount", body.contractAmount != null ? Math.round(body.contractAmount) : undefined);
  include("expiration", body.expiration); include("strike", body.strike);
  include("premium", body.premium); include("bid", body.bid); include("ask", body.ask);
  include("impliedVolatility", body.impliedVolatility); include("delta", body.delta);
  include("gamma", body.gamma); include("theta", body.theta); include("vega", body.vega);
  include("openInterest", body.openInterest); include("communityStarred", body.communityStarred);
  // analysisImageDataUrl DOES accept an explicit null here (unlike
  // contractAmount above) — that's how an admin removes a previously
  // attached chart screenshot from Wick's Read without touching anything else.
  include("analysisImageDataUrl", body.analysisImageDataUrl);

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  try {
    // Enforce the Community-feed cap here rather than at the schema level:
    // only checked when a signal is newly being turned on (flipping an
    // already-starred signal's other fields, or un-starring, must never be
    // blocked by this).
    if (updates.communityStarred === true) {
      const alreadyStarred = await db
        .select({ id: signalsTable.id })
        .from(signalsTable)
        .where(and(eq(signalsTable.communityStarred, true), ne(signalsTable.id, id)));
      if (alreadyStarred.length >= MAX_COMMUNITY_STARRED) {
        res.status(400).json({
          error: `Only ${MAX_COMMUNITY_STARRED} signals can be starred for Community at once — unstar one first.`,
        });
        return;
      }
    }

    const before = await db
      .select({ status: signalsTable.status })
      .from(signalsTable)
      .where(eq(signalsTable.id, id))
      .limit(1);
    const wasActive = before[0]?.status === "Active";

    await db.update(signalsTable).set(updates).where(eq(signalsTable.id, id));
    logger.info({ signalId: id, updates: Object.keys(updates) }, "Signal updated");
    res.json({ ok: true });

    // Notify only on the transition INTO "Active" — this is the moment an
    // auto-generated "Watching" signal (which never notifies on insert; see
    // signalScanner.ts) becomes a live call an admin has actually reviewed,
    // or an admin re-activates one. Avoids spamming subscribers for every
    // edit and for signals still sitting unreviewed.
    if (updates.status === "Active" && !wasActive) {
      const row = await db.select().from(signalsTable).where(eq(signalsTable.id, id)).limit(1);
      const s = row[0];
      if (s) {
        const signalSummary = {
          asset: s.asset,
          direction: s.direction,
          market: s.market,
          isOption: s.isOption ?? false,
          optionType: s.optionType ?? null,
        };
        void fanOutSignalNotification(signalSummary);
        void fanOutSignalEmail(signalSummary);
        if (s.newsAlert) {
          void fanOutNewsEmail({ asset: s.asset, market: s.market, note: s.newsAlertNote ?? "Flagged news event nearby this setup — verify before trading." });
        }
      }
    }
  } catch (err) {
    logger.error(err, "Failed to update signal");
    res.status(500).json({ error: "Failed to update signal" });
  }
});

// DELETE /api/signals/:id — remove a signal (admin only). Used to clear out
// auto-generated "Watching" signals an admin doesn't want to run with, same
// as removing any manually published one.
router.delete("/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const deleted = await db.delete(signalsTable).where(eq(signalsTable.id, id)).returning({ id: signalsTable.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: "Signal not found" });
      return;
    }
    logger.info({ signalId: id }, "Signal deleted");
    res.json({ ok: true });
  } catch (err) {
    logger.error(err, "Failed to delete signal");
    res.status(500).json({ error: "Failed to delete signal" });
  }
});

export default router;

const GRACE_PERIOD_DAYS = 5;
