import { Router, type Request, type Response } from "express";
import { db, usersTable, subscriptionsTable } from "../lib/db.js";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

/**
 * GET /api/auth/me
 * Returns the current user's profile and app-specific data.
 * JIT provisioning is handled by the requireAuth middleware.
 */
router.get("/me", requireAuth, (req: Request, res: Response) => {
  const user = req.dbUser!;
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    hasStripeCustomer: !!user.stripeCustomerId,
    notifySignals: user.notifySignals ?? true,
    notifyNews: user.notifyNews ?? false,
  });
});

/** PATCH /api/auth/push-token — register or refresh the Expo push token */
router.patch("/push-token", requireAuth, (req: Request, res: Response) => {
  const { pushToken } = req.body as { pushToken?: string };
  if (typeof pushToken !== "string" || !pushToken.trim()) {
    res.status(400).json({ error: "pushToken must be a non-empty string" });
    return;
  }
  const user = req.dbUser!;
  void db
    .update(usersTable)
    .set({ pushToken: pushToken.trim(), updatedAt: new Date() })
    .where(eq(usersTable.id, user.id))
    .then(() => res.json({ ok: true }))
    .catch((err) => {
      logger.error(err, "Failed to store push token");
      res.status(500).json({ error: "Failed to store push token" });
    });
});

/** PATCH /api/auth/notifications — update notification preferences */
router.patch("/notifications", requireAuth, (req: Request, res: Response) => {
  const { notifySignals, notifyNews } = req.body as {
    notifySignals?: boolean;
    notifyNews?: boolean;
  };
  if (notifySignals === undefined && notifyNews === undefined) {
    res.status(400).json({ error: "Provide at least one preference to update" });
    return;
  }
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof notifySignals === "boolean") updates.notifySignals = notifySignals;
  if (typeof notifyNews === "boolean") updates.notifyNews = notifyNews;

  const user = req.dbUser!;
  void db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, user.id))
    .then(() => res.json({ ok: true }))
    .catch((err) => {
      logger.error(err, "Failed to update notification preferences");
      res.status(500).json({ error: "Failed to update preferences" });
    });
});

/** GET /api/auth/subscription — returns the current user's subscription info */
router.get("/subscription", requireAuth, async (req: Request, res: Response) => {
  const user = req.dbUser!;
  try {
    const subs = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, user.id))
      .limit(1);
    const sub = subs[0] ?? null;
    res.json({
      subscription: sub
        ? {
            plan: sub.plan,
            status: sub.status,
            stripeSubscriptionId: sub.stripeSubscriptionId,
          }
        : null,
    });
  } catch (err) {
    logger.error(err, "Failed to fetch subscription");
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
});

export default router;
