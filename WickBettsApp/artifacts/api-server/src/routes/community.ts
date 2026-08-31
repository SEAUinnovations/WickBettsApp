import { Router, type Request, type Response } from "express";
import { db, communityPostsTable, communityPostReactionsTable, communitySignalsTable, memberFollowsTable, usersTable, subscriptionsTable } from "../lib/db.js";
import { eq, desc, gte, lt, and, or, ne, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { resolveLogoUrl } from "./market.js";
import { checkProfanity } from "../lib/profanityFilter.js";

const GRACE_PERIOD_DAYS = 5;

// Fixed emoji set — buttons, not a freeform picker (keeps rendering and
// validation simple, and matches "emote buttons" rather than a full emoji
// keyboard).
const ALLOWED_REACTIONS = ["👍", "🔥", "💯", "😂", "🚀", "📉"];

// Community chat (Signals + Community Chat threads) is a rolling 90-day
// window — older posts are filtered out of reads and periodically purged
// from the DB so the table doesn't grow unbounded and old chatter doesn't
// linger indefinitely.
const RETENTION_DAYS = 90;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
function retentionCutoff(): Date {
  return new Date(Date.now() - RETENTION_MS);
}

// The News thread gets its own, shorter window: news articles stop being
// relevant well before Signals/Community Chat posts do, so a stale month-old
// headline sitting in the feed is just clutter — auto-remove News posts
// older than 30 days on the same cleanup pass instead of waiting the full
// 90 days.
const NEWS_RETENTION_DAYS = 30;
const NEWS_RETENTION_MS = NEWS_RETENTION_DAYS * 24 * 60 * 60 * 1000;
function newsRetentionCutoff(): Date {
  return new Date(Date.now() - NEWS_RETENTION_MS);
}

// Per-thread retention condition shared by the read query (pass `gte` for
// "still within its window") and the cleanup job (pass `lt` for "past its
// window, delete it") — one place decides which cutoff applies to which
// thread, so the two call sites can never drift out of sync with each other.
function retentionCondition(cutoffComparator: typeof gte | typeof lt) {
  return or(
    and(eq(communityPostsTable.thread, "News"), cutoffComparator(communityPostsTable.createdAt, newsRetentionCutoff())),
    and(ne(communityPostsTable.thread, "News"), cutoffComparator(communityPostsTable.createdAt, retentionCutoff())),
  );
}

let cleanupStarted = false;
function startRetentionCleanup(): void {
  if (cleanupStarted) return;
  cleanupStarted = true;

  const runCleanup = () => {
    void db
      .delete(communityPostsTable)
      .where(retentionCondition(lt))
      .then(() => {
        logger.info({ retentionDays: RETENTION_DAYS, newsRetentionDays: NEWS_RETENTION_DAYS }, "Community post retention cleanup ran");
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

// SECURITY: this gate was previously defined but never applied to any route
// below — every Community route only required requireAuth, so any signed-up
// account (no subscription at all) had full read/write access to Community
// Chat, Shared Signals, reactions, and follows, which are documented and
// billed as a "Members only" paid perk (see the mobile client's "Members
// only" badge on this screen, and the identical gate already applied in
// signals.ts and tradeReviews.ts). Now wired into every route below except
// PATCH/DELETE /signals/:id, which stay ownership-only — a member who lets
// their subscription lapse should still be able to manage/delete their own
// past posts, they just can't read the feed or create new ones.
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
// has tapped. Only returns posts within each thread's retention window
// (RETENTION_DAYS for Signals/Community Chat, the shorter NEWS_RETENTION_DAYS
// for News); older posts are periodically purged from the DB entirely (see
// startRetentionCleanup above) — their reactions cascade-delete with them.
router.get("/", requireAuth, requireActiveSubscription, async (req: Request, res: Response) => {
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
      .where(retentionCondition(gte))
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
router.post("/:postId/react", requireAuth, requireActiveSubscription, async (req: Request, res: Response) => {
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

// DELETE /api/community/:postId — remove a chat message (author or admin
// only). Reactions on the post cascade-delete at the DB level (see
// communityPostReactionsTable's onDelete: "cascade" in
// lib/db/src/schema/communityPostReactions.ts), so nothing orphaned is left
// behind. Works across all three chat threads (Signals, News, Community
// Chat) — they share this one table, so one remove endpoint covers all of
// them rather than needing a per-thread variant.
//
// Deliberately NOT gated by requireActiveSubscription, same reasoning as
// DELETE /signals/:id below: a member whose subscription lapses should
// still be able to remove their own past messages — they just can't read
// the feed or post new ones without an active subscription.
router.delete("/:postId", requireAuth, async (req: Request, res: Response) => {
  const postId = String(req.params.postId);
  const user = req.dbUser!;
  try {
    const existing = await db
      .select({ authorId: communityPostsTable.authorId })
      .from(communityPostsTable)
      .where(eq(communityPostsTable.id, postId))
      .limit(1);
    const row = existing[0];
    if (!row) {
      res.status(404).json({ error: "Message not found" });
      return;
    }
    if (row.authorId !== user.id && user.role !== "admin") {
      res.status(403).json({ error: "You can only remove your own messages" });
      return;
    }
    await db.delete(communityPostsTable).where(eq(communityPostsTable.id, postId));
    logger.info({ postId, actorId: user.id }, "Community post removed");
    res.json({ ok: true });
  } catch (err) {
    logger.error(err, "Failed to remove community post");
    res.status(500).json({ error: "Failed to remove message" });
  }
});

const MAX_SIGNAL_NOTE_LENGTH = 500;

// GET /api/community/signals — member-shared trade ideas, distinct from the
// admin-curated /api/signals feed (these never appear there — see
// docs/adr). Returns the full recent set plus the requester's follow list;
// the Following/All split happens client-side, same pattern as GET / above.
router.get("/signals", requireAuth, requireActiveSubscription, async (req: Request, res: Response) => {
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

    // logoUrl is best-effort and computed on read, same as the admin-curated
    // /api/signals feed (see routes/signals.ts) — members can share any
    // ticker text here, so most will resolve to a real logo only when it's
    // inside Wick Betts' tracked universe (routes/market.ts); anything else
    // falls back to an initials badge client-side.
    const signals = rows.map((r) => ({ ...r, logoUrl: resolveLogoUrl(r.asset) }));
    res.json({ signals, following: followingRows.map((r) => r.followingId) });
  } catch (err) {
    logger.error(err, "Failed to fetch community signals");
    res.status(500).json({ error: "Failed to fetch community signals" });
  }
});

// POST /api/community/signals — share your own trade idea (members + admins).
// Deliberately lean: ticker, market, direction, entry/target, optional stop,
// and a short thesis note — no options/Greeks detail, keeping this distinct
// from Wick's curated options plays in the paid /signals feed.
router.post("/signals", requireAuth, requireActiveSubscription, async (req: Request, res: Response) => {
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
        logoUrl: resolveLogoUrl(record.asset),
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
router.post("/follow/:userId", requireAuth, requireActiveSubscription, async (req: Request, res: Response) => {
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
