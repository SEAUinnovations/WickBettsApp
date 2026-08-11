import { Router, type Request, type Response } from "express";
import { db, communityPostsTable, usersTable, subscriptionsTable } from "../lib/db.js";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const GRACE_PERIOD_DAYS = 5;

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
    if (
      s.status === "past_due" &&
      s.currentPeriodEnd &&
      new Date(s.currentPeriodEnd) >= graceCutoff
    ) {
      logger.warn(
        { userId: user.id, subscriptionId: s.id, status: s.status },
        "Community access via grace period — past_due webhook may be delayed"
      );
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

// GET /api/community — fetch posts with author name (all threads), newest first
router.get("/", requireAuth, requireActiveSubscription, async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: communityPostsTable.id,
        thread: communityPostsTable.thread,
        text: communityPostsTable.text,
        createdAt: communityPostsTable.createdAt,
        authorId: communityPostsTable.authorId,
        authorName: usersTable.name,
      })
      .from(communityPostsTable)
      .leftJoin(usersTable, eq(communityPostsTable.authorId, usersTable.id))
      .orderBy(desc(communityPostsTable.createdAt))
      .limit(200);

    res.json({ posts: rows });
  } catch (err) {
    logger.error(err, "Failed to fetch community posts");
    res.status(500).json({ error: "Failed to fetch community posts" });
  }
});

// POST /api/community — create a new post (members + admins)
router.post("/", requireAuth, requireActiveSubscription, async (req: Request, res: Response) => {
  const { thread, text } = req.body as { thread?: string; text?: string };

  const validThreads = ["Signals", "News", "Community Chat"];
  const resolvedThread = thread && validThreads.includes(thread) ? thread : "Community Chat";

  if (!text || !text.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  if (text.trim().length > 2000) {
    res.status(400).json({ error: "text must be 2000 characters or fewer" });
    return;
  }

  const user = req.dbUser!;
  try {
    const post = {
      id: randomUUID(),
      thread: resolvedThread as "Signals" | "News" | "Community Chat",
      authorId: user.id,
      text: text.trim(),
    };
    await db.insert(communityPostsTable).values(post);
    logger.info({ postId: post.id, authorId: user.id, thread: post.thread }, "Community post created");
    res.status(201).json({
      post: {
        ...post,
        createdAt: new Date(),
        authorName: user.name,
      },
    });
  } catch (err) {
    logger.error(err, "Failed to create community post");
    res.status(500).json({ error: "Failed to create community post" });
  }
});

export default router;
