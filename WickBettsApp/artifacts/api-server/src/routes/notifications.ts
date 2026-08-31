import { Router, type Request, type Response } from "express";
import { desc, eq } from "drizzle-orm";
import { db, notificationsTable, usersTable } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

// GET /api/notifications — the feed behind the bell icon (see
// components/WickUI.tsx's Header). Broadcast-style: every member sees the
// same rows (see notificationsTable's doc comment for why). `unreadCount` is
// derived per-request from the caller's own lastSeenNotificationsAt rather
// than stored anywhere, so there's nothing to keep in sync.
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const user = req.dbUser!;
  try {
    const rows = await db
      .select()
      .from(notificationsTable)
      .orderBy(desc(notificationsTable.createdAt))
      .limit(50);
    const unreadCount = rows.filter((n) => n.createdAt > user.lastSeenNotificationsAt).length;
    res.json({ notifications: rows, unreadCount });
  } catch (err) {
    logger.error(err, "Failed to fetch notifications");
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// POST /api/notifications/seen — call when the member opens the
// notifications screen, so the unread badge clears. Deliberately just a
// single timestamp bump rather than per-notification read state (see
// notificationsTable's doc comment).
router.post("/seen", requireAuth, async (req: Request, res: Response) => {
  const user = req.dbUser!;
  try {
    await db
      .update(usersTable)
      .set({ lastSeenNotificationsAt: new Date(), updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));
    res.json({ ok: true });
  } catch (err) {
    logger.error(err, "Failed to mark notifications seen");
    res.status(500).json({ error: "Failed to mark notifications seen" });
  }
});

export default router;
