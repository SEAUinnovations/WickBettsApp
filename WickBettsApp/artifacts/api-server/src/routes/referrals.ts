import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, referralsTable, subscriptionsTable } from "../lib/db.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { generateUniqueReferralCode } from "../lib/referralCode.js";
import { REFERRAL_CAP, REFERRAL_REWARD_CENTS } from "../lib/referralConfig.js";
import { logger } from "../lib/logger.js";

function resolveAppOrigin(): string {
  const configured = process.env.APP_ORIGIN?.trim();
  return configured ? configured.replace(/\/$/, "") : "https://wickbetts.com";
}

const router = Router();

/**
 * GET /api/referrals/me — the current member's referral code, shareable
 * link, and progress toward the referral cap. See
 * docs/referral-program-plan.md for the full reward mechanics.
 *
 * Lazily backfills a referral code for any account that predates this
 * feature (or whose code generation failed at signup) rather than
 * requiring a one-off migration script to populate every existing row.
 */
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const user = req.dbUser!;
  try {
    let code = user.referralCode;
    if (!code) {
      code = await generateUniqueReferralCode();
      await db.update(usersTable).set({ referralCode: code, updatedAt: new Date() }).where(eq(usersTable.id, user.id));
    }

    const referrals = await db.select().from(referralsTable).where(eq(referralsTable.referrerId, user.id));
    const rewarded = referrals.filter((r) => r.status === "rewarded");
    const pending = referrals.filter((r) => r.status === "pending" || r.status === "converted");
    const creditsEarnedCents = rewarded.reduce((sum, r) => sum + r.rewardAmountCents, 0);

    res.json({
      code,
      link: `${resolveAppOrigin()}/r/${code}`,
      tier: user.referralTier,
      rewardedCount: user.rewardedReferralCount,
      successfulReferralCount: rewarded.length,
      cap: REFERRAL_CAP,
      remainingSlots: Math.max(REFERRAL_CAP - user.rewardedReferralCount, 0),
      creditsEarnedCents,
      pendingCount: pending.length,
      rewardPerReferralCents: REFERRAL_REWARD_CENTS,
    });
  } catch (err) {
    logger.error(err, "Failed to load referral summary");
    res.status(500).json({ error: "Failed to load referral info" });
  }
});

/**
 * POST /api/referrals/attribute — attach a referral code to the current
 * account after the fact. Exists for exactly one case: Google OAuth
 * sign-in has no point to set Clerk `unsafeMetadata` before the account is
 * created (Clerk doesn't know whether an OAuth attempt will create a new
 * user or sign into an existing one until the redirect completes), so the
 * email/password sign-up's at-creation capture (see `jitProvisionUser` in
 * middlewares/requireAuth.ts) can't reach it. This is called client-side
 * immediately after a Google sign-in session goes active — see
 * components/GoogleSignInButton.tsx.
 *
 * Guarded the same way the at-signup path is guarded, just checked here
 * instead of implied by insert-time timing: only usable once
 * (`referredByUserId` must still be null) and only before the account's
 * first subscription exists. That second check is what keeps this from
 * reopening the "retroactively attribute a referral" gap the at-signup
 * design deliberately closed — once someone has converted, this endpoint
 * can no longer touch their referral attribution at all.
 */
router.post("/attribute", requireAuth, async (req: Request, res: Response) => {
  const user = req.dbUser!;
  const { referralCode: codeInput } = req.body as { referralCode?: string };
  const code = typeof codeInput === "string" ? codeInput.trim().toUpperCase() : "";
  if (!code) {
    res.status(400).json({ error: "referralCode is required" });
    return;
  }

  try {
    if (user.referredByUserId) {
      res.status(409).json({ error: "This account already has a referrer on record." });
      return;
    }

    const existingSubs = await db
      .select({ id: subscriptionsTable.id })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, user.id))
      .limit(1);
    if (existingSubs.length > 0) {
      res.status(409).json({ error: "Referral attribution is only available before your first subscription." });
      return;
    }

    const [referrer] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.referralCode, code))
      .limit(1);
    if (!referrer) {
      res.status(404).json({ error: "Referral code not found." });
      return;
    }
    if (referrer.id === user.id) {
      res.status(400).json({ error: "You can't refer yourself." });
      return;
    }

    await db
      .update(usersTable)
      .set({ referredByUserId: referrer.id, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));
    logger.info({ userId: user.id, referrerId: referrer.id }, "Referral attributed post-signup (Google OAuth path)");
    res.json({ ok: true });
  } catch (err) {
    logger.error(err, "Failed to attribute referral code");
    res.status(500).json({ error: "Failed to attribute referral code" });
  }
});

export default router;
