import { Router, type Request, type Response } from "express";
import { db, communityPostsTable, communityPostReactionsTable, communitySignalsTable, memberFollowsTable, usersTable, subscriptionsTable } from "../lib/db.js";
import { eq, desc, gte, lt, and, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { checkProfanity } from "../lib/profanityFilter.js";

const GRACE_PERIOD_DAYS = 5;

// Fixed emoji set — buttons, not a freeform picker (keeps rendering and
// validation simple, and matches "emote buttons" rather than a full emoji
// keyboard).
const ALLOWED_REACTIONS = ["👍", "🔥", "💯", "😂", "🚀", "📉"];

// Community chat is a rolling 30-day window — older posts are filtered out
// of reads and periodically purged from the DB so the table doesn't grow
// unbounded and old chatter doesn't linger indefinitely.
const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
function retentionCutoff(): Date {
  return new Date(Date.now() - RETENTION_MS);
}

let cleanupStarted = false;
function startRetentionCleanup(): void {
  if (cleanupStarted) return;
  cleanupStarted = true;

  const runCleanup = () => {
    void db
      .delete(communityPostsTable)
      .where(lt(communityPostsTable.createdAt, retentionCutoff()))
      .then(() => {
        logger.info({ retentionDays: RETENTION_DAYS }, "Community post retention cleanup ran");
      })
      .catch((err) => {
        logger.warn({ err }, "Community post retention cleanup failed");
      });
  };

  // Run once shortly after boot, then once every hour.
  setTimeout(runCleanup, 30_000);
  setInterval(runCleanup, 60 * 60 * 1000);
}

startRetentionCleanup();

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

// GET /api/community — fetch posts with author name (all threads), newest first,
// plus each post's reaction counts and which of them the requesting member
// has tapped. Only returns posts within the last RETENTION_DAYS days; older
// posts are periodically purged from the DB entirely (see
// startRetentionCleanup above) — their reactions cascade-delete with them.
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: communityPostsTable.id,
        thread: communityPostsTable.thread,
        text: communityPostsTable.text,
        createdAt: communityPostsTable.createdAt,
        authorId: communityPostsTable.authorId,
        authorName: usersTable.name,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(communityPostsTable)
      .leftJoin(usersTable, eq(communityPostsTable.authorId, usersTable.id))
      .where(gte(communityPostsTable.createdAt, retentionCutoff()))
      .orderBy(desc(communityPostsTable.createdAt))
      .limit(200);

    const postIds = rows.map((r) => r.id);
    const reactionsByPost = new Map<string, { counts: Record<string, number>; mine: string[] }>();
    if (postIds.length > 0) {
      const reactionRows = await db
        .select({
          postId: communityPostReactionsTable.postId,
          emoji: communityPostReactionsTable.emoji,
          userId: communityPostReactionsTable.userId,
        })
        .from(communityPostReactionsTable)
        .where(inArray(communityPostReactionsTable.postId, postIds));

      const myId = req.dbUser!.id;
      for (const r of reactionRows) {
        const entry = reactionsByPost.get(r.postId) ?? { counts: {}, mine: [] };
        entry.counts[r.emoji] = (entry.counts[r.emoji] ?? 0) + 1;
        if (r.userId === myId) entry.mine.push(r.emoji);
        reactionsByPost.set(r.postId, entry);
      }
    }

    const posts = rows.map((r) => ({
      ...r,
      reactions: reactionsByPost.get(r.id) ?? { counts: {}, mine: [] },
    }));

    res.json({ posts, allowedReactions: ALLOWED_REACTIONS });
  } catch (err) {
    logger.error(err, "Failed to fetch community posts");
    res.status(500).json({ error: "Failed to fetch community posts" });
  }
});

// POST /api/community/:postId/react — toggle a reaction on/off for the
// requesting member. Re-tapping the same emoji removes it (relies on the
// (post_id, user_id, emoji) unique index — insert fails silently.. actually
// we check existence explicitly below to return an accurate toggled state).
router.post("/:postId/react", requireAuth, async (req: Request, res: Response) => {
  const postId = String(req.params.postId);
  const { emoji } = req.body as { emoji?: string };

  if (!emoji || !ALLOWED_REACTIONS.includes(emoji)) {
    res.status(400).json({ error: `emoji must be one of: ${ALLOWED_REACTIONS.join(" ")}` });
    return;
  }

  const user = req.dbUser!;
  try {
    const post = await db.select({ id: communityPostsTable.id }).from(communityPostsTable).where(eq(communityPostsTable.id, postId)).limit(1);
    if (post.length === 0) {
      res.status(404).json({ error: "Post not found" });
      return;
    }

    const existing = await db
      .select({ id: communityPostReactionsTable.id })
      .from(communityPostReactionsTable)
      .where(
        and(
          eq(communityPostReactionsTable.postId, postId),
          eq(communityPostReactionsTable.userId, user.id),
          eq(communityPostReactionsTable.emoji, emoji),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await db.delete(communityPostReactionsTable).where(eq(communityPostReactionsTable.id, existing[0].id));
      res.json({ ok: true, active: false, emoji });
      return;
    }

    await db.insert(communityPostReactionsTable).values({
      id: randomUUID(),
      postId,
      userId: user.id,
      emoji,
    });
    res.json({ ok: true, active: true, emoji });
  } catch (err) {
    logger.error(err, "Failed to toggle community post reaction");
    res.status(500).json({ error: "Failed to react to post" });
  }
});

// POST /api/community — create a new post (members + admins)
router.post("/", requireAuth, async (req: Request, res: Response) => {
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
  const profanityCheck = checkProfanity(text);
  if (profanityCheck.blocked) {
    res.status(422).json({ error: "That message was blocked for inappropriate language.", code: "PROFANITY_BLOCKED" });
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
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    logger.error(err, "Failed to create community post");
    res.status(500).json({ error: "Failed to create community post" });
  }
});

const MAX_SIGNAL_NOTE_LENGTH = 500;

// GET /api/community/signals — member-shared trade ideas, distinct from the
// admin-curated /api/signals feed (these never appear there — see
// docs/adr). Returns the full recent set plus the requester's follow list;
// the Following/All split happens client-side, same pattern as GET / above.
router.get("/signals", requireAuth, async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        id: communitySignalsTable.id,
        authorId: communitySignalsTable.authorId,
        asset: communitySignalsTable.asset,
        market: communitySignalsTable.market,
        direction: communitySignalsTable.direction,
        entry: communitySignalsTable.entry,
        target: communitySignalsTable.target,
        stop: communitySignalsTable.stop,
        note: communitySignalsTable.note,
        status: communitySignalsTable.status,
        createdAt: communitySignalsTable.createdAt,
        updatedAt: communitySignalsTable.updatedAt,
        authorName: usersTable.name,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(communitySignalsTable)
      .leftJoin(usersTable, eq(communitySignalsTable.authorId, usersTable.id))
      .orderBy(desc(communitySignalsTable.createdAt))
      .limit(200);

    const followingRows = await db
      .select({ followingId: memberFollowsTable.followingId })
      .from(memberFollowsTable)
      .where(eq(memberFollowsTable.followerId, req.dbUser!.id));

    res.json({ signals: rows, following: followingRows.map((r) => r.followingId) });
  } catch (err) {
    logger.error(err, "Failed to fetch community signals");
    res.status(500).json({ error: "Failed to fetch community signals" });
  }
});

// POST /api/community/signals — share your own trade idea (members + admins).
// Deliberately lean: ticker, market, direction, entry/target, optional stop,
// and a short thesis note — no options/Greeks detail, keeping this distinct
// from Wick's curated options plays in the paid /signals feed.
router.post("/signals", requireAuth, async (req: Request, res: Response) => {
  const { asset, market, direction, entry, target, stop, note } = req.body as {
    asset?: string; market?: "Stocks" | "Crypto"; direction?: "Long" | "Short";
    entry?: string; target?: string; stop?: string; note?: string;
  };

  if (!asset?.trim() || !entry?.trim() || !target?.trim() || !note?.trim()) {
    res.status(400).json({ error: "asset, entry, target, and note are required" });
    return;
  }
  if (market != null && market !== "Stocks" && market !== "Crypto") {
    res.status(400).json({ error: "Invalid market value" });
    return;
  }
  if (direction != null && direction !== "Long" && direction !== "Short") {
    res.status(400).json({ error: "Invalid direction value" });
    return;
  }
  if (note.trim().length > MAX_SIGNAL_NOTE_LENGTH) {
    res.status(400).json({ error: `note must be ${MAX_SIGNAL_NOTE_LENGTH} characters or fewer` });
    return;
  }
  const profanityCheck = checkProfanity(note);
  if (profanityCheck.blocked) {
    res.status(422).json({ error: "That note was blocked for inappropriate language.", code: "PROFANITY_BLOCKED" });
    return;
  }

  const user = req.dbUser!;
  try {
    const record = {
      id: randomUUID(),
      authorId: user.id,
      asset: asset.trim().toUpperCase(),
      market: market ?? "Stocks",
      direction: direction ?? "Long",
      entry: entry.trim(),
      target: target.trim(),
      stop: stop?.trim() || undefined,
      note: note.trim(),
    };
    await db.insert(communitySignalsTable).values(record);
    logger.info({ signalId: record.id, authorId: user.id, asset: record.asset }, "Community signal shared");
    res.status(201).json({
      signal: {
        ...record,
        status: "Open",
        createdAt: new Date(),
        updatedAt: new Date(),
        authorName: user.name,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    logger.error(err, "Failed to share community signal");
    res.status(500).json({ error: "Failed to share signal" });
  }
});

// PATCH /api/community/signals/:id — author (or admin) can edit fields or
// toggle status, e.g. { status: "Closed" } once the idea has played out.
router.patch("/signals/:id", requireAuth, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const user = req.dbUser!;
  const body = req.body as {
    entry?: string; target?: string; stop?: string | null; note?: string; status?: "Open" | "Closed";
  };

  try {
    const existing = await db.select().from(communitySignalsTable).where(eq(communitySignalsTable.id, id)).limit(1);
    const row = existing[0];
    if (!row) {
      res.status(404).json({ error: "Signal not found" });
      return;
    }
    if (row.authorId !== user.id && user.role !== "admin") {
      res.status(403).json({ error: "You can only edit your own shared signals" });
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status != null) {
      if (body.status !== "Open" && body.status !== "Closed") {
        res.status(400).json({ error: "Invalid status value" });
        return;
      }
      updates.status = body.status;
    }
    if (body.entry != null) updates.entry = body.entry.trim();
    if (body.target != null) updates.target = body.target.trim();
    if (body.stop !== undefined) updates.stop = body.stop?.trim() || null;
    if (body.note != null) {
      const trimmedNote = body.note.trim();
      if (trimmedNote.length === 0 || trimmedNote.length > MAX_SIGNAL_NOTE_LENGTH) {
        res.status(400).json({ error: `note must be 1-${MAX_SIGNAL_NOTE_LENGTH} characters` });
        return;
      }
      const profanityCheck = checkProfanity(trimmedNote);
      if (profanityCheck.blocked) {
        res.status(422).json({ error: "That note was blocked for inappropriate language.", code: "PROFANITY_BLOCKED" });
        return;
      }
      updates.note = trimmedNote;
    }

    await db.update(communitySignalsTable).set(updates).where(eq(communitySignalsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    logger.error(err, "Failed to update community signal");
    res.status(500).json({ error: "Failed to update signal" });
  }
});

// DELETE /api/community/signals/:id — author or admin only.
router.delete("/signals/:id", requireAuth, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const user = req.dbUser!;
  try {
    const existing = await db
      .select({ authorId: communitySignalsTable.authorId })
      .from(communitySignalsTable)
      .where(eq(communitySignalsTable.id, id))
      .limit(1);
    const row = existing[0];
    if (!row) {
      res.status(404).json({ error: "Signal not found" });
      return;
    }
    if (row.authorId !== user.id && user.role !== "admin") {
      res.status(403).json({ error: "You can only delete your own shared signals" });
      return;
    }
    await db.delete(communitySignalsTable).where(eq(communitySignalsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    logger.error(err, "Failed to delete community signal");
    res.status(500).json({ error: "Failed to delete signal" });
  }
});

// POST /api/community/follow/:userId — toggle following another member.
// Following is user-to-user, not per-signal: it drives which authors'
// future shared signals surface in the follower's personalized feed.
router.post("/follow/:userId", requireAuth, async (req: Request, res: Response) => {
  const targetId = String(req.params.userId);
  const user = req.dbUser!;

  if (targetId === user.id) {
    res.status(400).json({ error: "You can't follow yourself" });
    return;
  }

  try {
    const target = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
    if (target.length === 0) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    const existing = await db
      .select({ id: memberFollowsTable.id })
      .from(memberFollowsTable)
      .where(and(eq(memberFollowsTable.followerId, user.id), eq(memberFollowsTable.followingId, targetId)))
      .limit(1);

    if (existing.length > 0) {
      await db.delete(memberFollowsTable).where(eq(memberFollowsTable.id, existing[0].id));
      res.json({ ok: true, following: false });
      return;
    }

    await db.insert(memberFollowsTable).values({ id: randomUUID(), followerId: user.id, followingId: targetId });
    res.json({ ok: true, following: true });
  } catch (err) {
    logger.error(err, "Failed to toggle follow");
    res.status(500).json({ error: "Failed to update follow status" });
  }
});

export default router;
