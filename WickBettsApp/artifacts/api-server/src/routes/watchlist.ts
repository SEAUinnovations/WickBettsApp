import { Router, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { db, watchlistsTable } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { isTrackedSymbol } from "./market.js";

const router = Router();

function getParamId(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const user = req.dbUser!;
  try {
    const items = await db
      .select()
      .from(watchlistsTable)
      .where(eq(watchlistsTable.userId, user.id))
      .orderBy(asc(watchlistsTable.createdAt));
    res.json({ items });
  } catch (err) {
    logger.error(err, "Failed to fetch watchlist");
    res.status(500).json({ error: "Failed to fetch watchlist" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  const user = req.dbUser!;
  const { symbol, note, targetPrice } = req.body as {
    symbol?: string;
    note?: string;
    targetPrice?: string;
  };
  const normalizedSymbol = symbol?.trim().toUpperCase() ?? "";
  if (!normalizedSymbol || !/^[A-Z0-9.^-]{1,15}$/.test(normalizedSymbol)) {
    res.status(400).json({ error: "symbol must be a valid ticker" });
    return;
  }
  if (!isTrackedSymbol(normalizedSymbol)) {
    res.status(400).json({ error: "symbol is not currently supported in the tracked market universe" });
    return;
  }

  try {
    const existing = await db
      .select()
      .from(watchlistsTable)
      .where(and(eq(watchlistsTable.userId, user.id), eq(watchlistsTable.symbol, normalizedSymbol)))
      .limit(1);

    if (existing[0]) {
      res.status(409).json({ error: "symbol already exists in watchlist" });
      return;
    }

    const item = {
      id: randomUUID(),
      userId: user.id,
      symbol: normalizedSymbol,
      note: note?.trim() || null,
      targetPrice: targetPrice?.trim() || null,
    };
    await db.insert(watchlistsTable).values(item as any);
    res.status(201).json({ item: { ...item, createdAt: new Date(), updatedAt: new Date() } });
  } catch (err) {
    logger.error(err, "Failed to create watchlist item");
    res.status(500).json({ error: "Failed to create watchlist item" });
  }
});

router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  const user = req.dbUser!;
  const itemId = getParamId(req.params.id);
  const { note, targetPrice } = req.body as { note?: string; targetPrice?: string };
  try {
    await db
      .update(watchlistsTable)
      .set({
        note: typeof note === "string" ? (note.trim() || null) : undefined,
        targetPrice: typeof targetPrice === "string" ? (targetPrice.trim() || null) : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(watchlistsTable.id, itemId), eq(watchlistsTable.userId, user.id)));
    res.json({ ok: true });
  } catch (err) {
    logger.error(err, "Failed to update watchlist item");
    res.status(500).json({ error: "Failed to update watchlist item" });
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  const user = req.dbUser!;
  const itemId = getParamId(req.params.id);
  try {
    await db
      .delete(watchlistsTable)
      .where(and(eq(watchlistsTable.id, itemId), eq(watchlistsTable.userId, user.id)));
    res.json({ ok: true });
  } catch (err) {
    logger.error(err, "Failed to delete watchlist item");
    res.status(500).json({ error: "Failed to delete watchlist item" });
  }
});

export default router;