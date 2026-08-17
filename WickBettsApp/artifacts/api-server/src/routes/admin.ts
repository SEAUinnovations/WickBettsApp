import { Router, type Request, type Response } from "express";
import { db, usersTable, subscriptionsTable, supportTicketsTable } from "../lib/db.js";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import OpenAI from "openai";
import { requireAuth, requireAdmin, isBootstrapAdmin } from "../middlewares/requireAuth.js";
import { pickPrimarySubscription } from "../lib/subscriptionUtils.js";
import { aiRateLimit } from "../middlewares/rateLimit.js";

const router = Router();

// Lazy-init OpenAI client (only when the key is present)
function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// GET /api/admin/users — member roster, each row enriched with billing info
// so admins can see who's paying, what plan, and whether payment has lapsed
// without leaving the app or opening the Stripe dashboard.
router.get("/users", requireAuth, requireAdmin, async (_req, res) => {
  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      avatarUrl: usersTable.avatarUrl,
      role: usersTable.role,
      stripeCustomerId: usersTable.stripeCustomerId,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(usersTable.createdAt);

  const allSubs = await db.select().from(subscriptionsTable);
  const subsByUser = new Map<string, typeof allSubs>();
  for (const sub of allSubs) {
    const list = subsByUser.get(sub.userId) ?? [];
    list.push(sub);
    subsByUser.set(sub.userId, list);
  }

  const enriched = users.map((u) => {
    const primary = pickPrimarySubscription(subsByUser.get(u.id) ?? []);
    return {
      ...u,
      hasStripeCustomer: !!u.stripeCustomerId,
      subscription: primary
        ? {
            plan: primary.plan,
            status: primary.status,
            currentPeriodEnd: primary.currentPeriodEnd,
            cancelAtPeriodEnd: primary.cancelAtPeriodEnd === "true",
          }
        : null,
    };
  });

  res.json({ users: enriched });
});

// PATCH /api/admin/users/:id/role — grant or revoke admin
router.patch("/users/:id/role", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { role } = req.body as { role: "admin" | "member" };
  if (!["admin", "member"].includes(role)) {
    res.status(400).json({ error: "Role must be 'admin' or 'member'" });
    return;
  }
  const self = req.dbUser!;
  const target = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!target.length) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (isBootstrapAdmin(target[0].email) && role !== "admin") {
    res.status(400).json({ error: "Cannot remove admin role from a bootstrap admin account. Remove it from BOOTSTRAP_ADMIN_EMAILS first." });
    return;
  }
  await db.update(usersTable).set({ role, updatedAt: new Date() }).where(eq(usersTable.id, id));
  logger.info({ actorId: self.id, targetId: id, role }, "Admin role updated");
  res.json({ ok: true, id, role });
});

// POST /api/admin/extract-signal — AI screenshot → signal fields
router.post("/extract-signal", requireAuth, requireAdmin, aiRateLimit, async (req: Request, res: Response) => {
  const { imageBase64 } = req.body as { imageBase64?: string };
  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }

  let openai: OpenAI;
  try {
    openai = getOpenAI();
  } catch {
    res.status(503).json({ error: "AI scanning is not configured. Add OPENAI_API_KEY to enable this feature." });
    return;
  }

  const prompt = `You are a financial data extractor. The user has uploaded a screenshot of a stock or options trade from a brokerage platform, trading app, or signal alert.

Extract every field you can find and return a JSON object with these exact keys (omit a key if the value is not visible or not applicable):

{
  "asset": "ticker symbol e.g. NVDA",
  "market": "Stocks" or "Crypto",
  "direction": "Long" or "Short",
  "isOption": true or false,
  "optionType": "Call" or "Put",
  "contract": "full OCC-style contract string e.g. NVDA 22 AUG 26 130 C",
  "expiration": "human readable date e.g. Aug 22, 2026",
  "strike": "strike price with $ e.g. $130.00",
  "premium": "option premium / debit paid e.g. $3.42",
  "bid": "bid price e.g. $3.38",
  "ask": "ask price e.g. $3.46",
  "entry": "entry price for the underlying or debit paid",
  "target": "price target",
  "stop": "stop loss",
  "impliedVolatility": "IV as percentage string e.g. 48.6%",
  "delta": "delta as string number e.g. 0.42",
  "gamma": "gamma as string number e.g. 0.018",
  "theta": "theta as string number e.g. -0.11",
  "vega": "vega as string number e.g. 0.19",
  "openInterest": "open interest e.g. 18,420",
  "timeframe": "trade timeframe or expiry context e.g. Aug 22 expiry"
}

Return ONLY the JSON object, no explanation or markdown code block.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed: Record<string, string | boolean>;
    try {
      parsed = JSON.parse(clean) as Record<string, string | boolean>;
    } catch {
      logger.warn({ raw }, "AI response was not valid JSON");
      res.status(422).json({ error: "Could not parse signal data from screenshot. Try a clearer image or fill in the fields manually." });
      return;
    }

    logger.info({ asset: parsed.asset }, "Signal extracted from screenshot via AI");
    res.json(parsed);
  } catch (err) {
    logger.error(err, "OpenAI vision call failed");
    res.status(502).json({ error: "AI screenshot scan failed. Check your OpenAI API key and try again." });
  }
});

// GET /api/admin/tickets — every submitted technical-support ticket, most
// recent first, so an open issue never scrolls out of view behind old
// resolved ones.
router.get("/tickets", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const tickets = await db.select().from(supportTicketsTable).orderBy(desc(supportTicketsTable.createdAt));
    res.json({ tickets });
  } catch (err) {
    logger.error(err, "Failed to fetch support tickets");
    res.status(500).json({ error: "Could not load support tickets." });
  }
});

// PATCH /api/admin/tickets/:id — mark a ticket open/resolved
router.patch("/tickets/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { status } = req.body as { status?: "open" | "resolved" };
  if (status !== "open" && status !== "resolved") {
    res.status(400).json({ error: "status must be 'open' or 'resolved'" });
    return;
  }
  const existing = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id)).limit(1);
  if (!existing.length) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  await db.update(supportTicketsTable).set({ status, updatedAt: new Date() }).where(eq(supportTicketsTable.id, id));
  res.json({ ok: true, id, status });
});

export default router;
