import { Router, type Request, type Response } from "express";
import { db, tradeReviewsTable, usersTable, subscriptionsTable } from "../lib/db.js";
import { eq, desc, and, gte, count } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { aiRateLimit } from "../middlewares/rateLimit.js";
import { checkProfanity } from "../lib/profanityFilter.js";
import { reviewTradeChart, TradeReviewAIError } from "../services/tradeReviewAI.js";

const GRACE_PERIOD_DAYS = 5;

// 4 free reviews per rolling 7-day window (not calendar week — a rolling
// window needs no reset job and self-corrects, see
// docs/adr/0003-trade-review-ai-provider.md). Extra reviews beyond that
// consume a paid credit ($2.50 each, purchased via
// POST /api/stripe/trade-review-credit-checkout).
const FREE_REVIEWS_PER_WINDOW = 4;
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

async function getUsage(userId: string): Promise<{ usedThisWindow: number; freeRemaining: number; credits: number }> {
  const windowStart = new Date(Date.now() - WINDOW_MS);
  const [{ value: usedThisWindow }] = await db
    .select({ value: count() })
    .from(tradeReviewsTable)
    .where(and(eq(tradeReviewsTable.authorId, userId), gte(tradeReviewsTable.createdAt, windowStart)));

  const [row] = await db
    .select({ credits: usersTable.extraTradeReviewCredits })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  return {
    usedThisWindow,
    freeRemaining: Math.max(0, FREE_REVIEWS_PER_WINDOW - usedThisWindow),
    credits: row?.credits ?? 0,
  };
}

// Same subscription gate used by community.ts and signals.ts — Review My
// Trade is a subscriber-only perk, same as the rest of the paid feed.
async function requireActiveSubscription(req: Request, res: Response, next: () => void) {
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
    if (s.status === "past_due" && s.currentPeriodEnd && new Date(s.currentPeriodEnd) >= graceCutoff) {
      return true;
    }
    return false;
  });

  if (!hasSub && user.role !== "admin") {
    res.status(403).json({ error: "Active subscription required", code: "SUBSCRIPTION_REQUIRED" });
    return;
  }
  next();
}

const router = Router();

const VALID_BIAS = ["Bullish", "Bearish", "Neutral"];

// GET /api/trade-reviews — community feed of submitted trades + AI reviews,
// plus the requesting member's own usage (used for the "3/4 free reviews
// left this week" indicator and the paywall prompt).
router.get("/", requireAuth, requireActiveSubscription, async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: tradeReviewsTable.id,
        authorId: tradeReviewsTable.authorId,
        authorName: usersTable.name,
        avatarUrl: usersTable.avatarUrl,
        imageDataUrl: tradeReviewsTable.imageDataUrl,
        description: tradeReviewsTable.description,
        bias: tradeReviewsTable.bias,
        aiTechnicalRead: tradeReviewsTable.aiTechnicalRead,
        aiVerdict: tradeReviewsTable.aiVerdict,
        aiBiasExplanation: tradeReviewsTable.aiBiasExplanation,
        aiRiskNote: tradeReviewsTable.aiRiskNote,
        aiSummary: tradeReviewsTable.aiSummary,
        createdAt: tradeReviewsTable.createdAt,
      })
      .from(tradeReviewsTable)
      .leftJoin(usersTable, eq(tradeReviewsTable.authorId, usersTable.id))
      .orderBy(desc(tradeReviewsTable.createdAt))
      .limit(50);

    const usage = await getUsage(req.dbUser!.id);
    res.json({ reviews: rows, usage });
  } catch (err) {
    logger.error(err, "Failed to fetch trade reviews");
    res.status(500).json({ error: "Failed to fetch trade reviews" });
  }
});

// POST /api/trade-reviews — submit a chart screenshot for an instant AI review (OpenAI vision).
// Fully automated: the AI call happens synchronously and the result posts
// immediately — no admin approval step (matches the "isn't going to be a
// hassle" requirement for this feature specifically; this is a different
// trust model than the auto-signals scanner, which does land as "Watching"
// for review since those carry real position-sizing numbers).
router.post("/", requireAuth, requireActiveSubscription, aiRateLimit, async (req: Request, res: Response) => {
  const { imageDataUrl, description, bias } = req.body as {
    imageDataUrl?: string;
    description?: string;
    bias?: string;
  };

  if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
    res.status(400).json({ error: "imageDataUrl must be a base64 image data URL" });
    return;
  }
  if (!description || !description.trim()) {
    res.status(400).json({ error: "description is required" });
    return;
  }
  if (description.trim().length > 1000) {
    res.status(400).json({ error: "description must be 1000 characters or fewer" });
    return;
  }
  if (!bias || !VALID_BIAS.includes(bias)) {
    res.status(400).json({ error: `bias must be one of: ${VALID_BIAS.join(", ")}` });
    return;
  }
  const profanityCheck = checkProfanity(description);
  if (profanityCheck.blocked) {
    res.status(422).json({ error: "That description was blocked for inappropriate language.", code: "PROFANITY_BLOCKED" });
    return;
  }

  const user = req.dbUser!;
  const trimmedDescription = description.trim();
  const resolvedBias = bias as "Bullish" | "Bearish" | "Neutral";

  // Admins get unlimited reviews (they're moderating/testing, not consuming
  // the paid perk); everyone else gets 4 free per rolling week, then must
  // spend a purchased credit.
  const usage = user.role === "admin" ? null : await getUsage(user.id);
  const usingPaidCredit = usage !== null && usage.freeRemaining <= 0;
  if (usage !== null && usage.freeRemaining <= 0 && usage.credits <= 0) {
    res.status(402).json({
      error: `You've used your ${FREE_REVIEWS_PER_WINDOW} free trade reviews this week. Buy another for $2.50.`,
      code: "TRADE_REVIEW_LIMIT_REACHED",
      pricePerReviewCents: 250,
    });
    return;
  }

  try {
    const aiResult = await reviewTradeChart(imageDataUrl, trimmedDescription, resolvedBias);

    const review = {
      id: randomUUID(),
      authorId: user.id,
      imageDataUrl,
      description: trimmedDescription,
      bias: resolvedBias,
      aiTechnicalRead: aiResult.technicalRead,
      aiVerdict: aiResult.verdict,
      aiBiasExplanation: aiResult.biasExplanation,
      aiRiskNote: aiResult.riskNote,
      aiSummary: aiResult.summary,
    };

    await db.insert(tradeReviewsTable).values(review);

    // Only spend a credit once the review actually succeeded — a failed AI
    // call (bad image, OpenAI error) shouldn't cost the member anything.
    // Note: like the free-quota check above, this isn't wrapped in a DB
    // transaction/row lock, so two simultaneous submissions from the same
    // account could in principle both pass the check before either
    // decrements — an accepted soft edge at this app's volume rather than
    // a security issue (nothing but that member's own usage count is at
    // risk). See docs/adr/0003-trade-review-ai-provider.md.
    if (usingPaidCredit) {
      await db
        .update(usersTable)
        .set({ extraTradeReviewCredits: Math.max(0, (usage?.credits ?? 1) - 1), updatedAt: new Date() })
        .where(eq(usersTable.id, user.id));
    }

    logger.info(
      { reviewId: review.id, authorId: user.id, verdict: aiResult.verdict, usingPaidCredit },
      "Trade review created",
    );

    res.status(201).json({
      review: {
        ...review,
        createdAt: new Date(),
        authorName: user.name,
        avatarUrl: user.avatarUrl,
      },
      usage: await getUsage(user.id),
    });
  } catch (err) {
    if (err instanceof TradeReviewAIError) {
      logger.warn({ err: err.message, authorId: user.id }, "Trade review AI call failed");
      res.status(502).json({ error: err.message });
      return;
    }
    logger.error(err, "Failed to create trade review");
    res.status(500).json({ error: "Failed to create trade review" });
  }
});

export default router;
