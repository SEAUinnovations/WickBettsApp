import { Router, type Request, type Response } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db, usersTable, subscriptionsTable } from "../lib/db.js";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { pickPrimarySubscription } from "../lib/subscriptionUtils.js";

const router = Router();
const isDevAuthMode = (process.env.DEV_AUTH_MODE?.trim().toLowerCase() === "localhost") || (process.env.DEV_AUTH_MODE?.trim().toLowerCase() === "dev");

async function resolveClerkMetadata(userId: string): Promise<{
  timezone: string;
}> {
  const clerkUser = await clerkClient.users.getUser(userId);
  const unsafeMetadata = clerkUser.unsafeMetadata as { timezone?: unknown } | undefined;
  return {
    timezone: typeof unsafeMetadata?.timezone === "string" ? unsafeMetadata.timezone.trim() : "",
  };
}

/**
 * GET /api/auth/me
 * Returns the current user's profile and app-specific data.
 * JIT provisioning is handled by the requireAuth middleware.
 */
router.get("/me", requireAuth, (req: Request, res: Response) => {
  const user = req.dbUser!;
  if (isDevAuthMode) {
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      hasStripeCustomer: !!user.stripeCustomerId,
      notifySignals: user.notifySignals ?? true,
      notifyNews: user.notifyNews ?? false,
      timezone: null,
    });
    return;
  }

  const auth = getAuth(req);
  void resolveClerkMetadata(auth.userId!)
    .then((metadata) => {
      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
        hasStripeCustomer: !!user.stripeCustomerId,
        notifySignals: user.notifySignals ?? true,
        notifyNews: user.notifyNews ?? false,
        timezone: metadata.timezone || null,
      });
    })
    .catch((err) => {
      logger.error(err, "Failed to resolve Clerk metadata for /auth/me");
      res.status(500).json({ error: "Failed to fetch profile" });
    });
});

/** PATCH /api/auth/profile — update user profile metadata stored in Clerk */
router.patch("/profile", requireAuth, async (req: Request, res: Response) => {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const { timezone } = req.body as { timezone?: string };
  if (typeof timezone !== "string" || !timezone.trim()) {
    res.status(400).json({ error: "timezone must be a non-empty string" });
    return;
  }

  try {
    const clerkUser = await clerkClient.users.getUser(auth.userId);
    const currentMetadata = (clerkUser.unsafeMetadata as Record<string, unknown> | undefined) ?? {};
    await clerkClient.users.updateUser(auth.userId, {
      unsafeMetadata: {
        ...currentMetadata,
        timezone: timezone.trim(),
      },
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error(err, "Failed to update profile metadata");
    res.status(500).json({ error: "Failed to update profile" });
  }
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
      .where(eq(subscriptionsTable.userId, user.id));
    const sub = pickPrimarySubscription(subs);
    res.json({
      subscription: sub
        ? {
            plan: sub.plan,
            status: sub.status,
            stripeSubscriptionId: sub.stripeSubscriptionId,
            currentPeriodEnd: sub.currentPeriodEnd,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd === "true",
          }
        : null,
    });
  } catch (err) {
    logger.error(err, "Failed to fetch subscription");
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
});

export default router;
