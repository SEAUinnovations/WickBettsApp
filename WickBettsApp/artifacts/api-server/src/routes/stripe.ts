import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import { db, usersTable, subscriptionsTable } from "../lib/db.js";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const PRICE_SIGNALS = process.env.STRIPE_PRICE_SIGNALS;
const PRICE_MENTORSHIP = process.env.STRIPE_PRICE_MENTORSHIP;
const PRICE_MEMBERSHIP = process.env.STRIPE_PRICE_MEMBERSHIP;

type ProductPlan = "signals" | "mentorship" | "membership";

function resolveAppOrigin(): string {
  const configured = process.env.APP_ORIGIN?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const replitDomain = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (replitDomain) {
    return `https://${replitDomain}`;
  }

  return "http://localhost:3000";
}

function getStripe(): Stripe | null {
  if (!STRIPE_SECRET_KEY) return null;
  return new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-07-29.dahlia" });
}

const router = Router();

// ── POST /api/stripe/create-checkout ──────────────────────────────────────────
router.post("/create-checkout", requireAuth, async (req: Request, res: Response) => {
    const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: "Stripe is not configured. Add STRIPE_SECRET_KEY to proceed." });
    return;
  }

  const { plan } = req.body as { plan: ProductPlan };
  const priceId =
    plan === "mentorship"
      ? PRICE_MENTORSHIP
      : plan === "membership"
        ? PRICE_MEMBERSHIP
        : PRICE_SIGNALS;
  if (!priceId) {
    res.status(503).json({ error: `Stripe price ID for plan "${plan}" is not set.` });
    return;
  }

  const user = req.dbUser!;
  const appOrigin = resolveAppOrigin();

  try {
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await db
        .update(usersTable)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(usersTable.id, user.id));
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: {
          userId: user.id,
          plan: plan === "mentorship" ? "mentorship" : plan === "membership" ? "membership" : "signals",
        },
      },
      success_url: `${appOrigin}/?checkout=success`,
      cancel_url: `${appOrigin}/?checkout=cancelled`,
    });
    if (!session.url) {
      res.status(500).json({ error: "Stripe did not return a checkout URL" });
      return;
    }
    res.json({ url: session.url });
  } catch (err) {
    logger.error(err, "Stripe checkout creation failed");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// ── POST /api/stripe/create-portal ────────────────────────────────────────────
router.post(
  "/create-portal",
  requireAuth,
  async (req: Request, res: Response) => {
    const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: "Stripe is not configured." });
    return;
  }
  const user = req.dbUser!;
  if (!user.stripeCustomerId) {
    res.status(400).json({ error: "No Stripe customer found for this account." });
    return;
  }
  const appOrigin = resolveAppOrigin();
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${appOrigin}/app/profile`,
    });
    res.json({ url: session.url });
  } catch (err) {
    logger.error(err, "Stripe portal creation failed");
    res.status(500).json({ error: "Failed to create billing portal" });
  }
});

// ── POST /api/stripe/webhook ───────────────────────────────────────────────────
router.post(
  "/webhook",
  async (req: Request, res: Response) => {
    const stripe = getStripe();
    if (!stripe || !STRIPE_WEBHOOK_SECRET) {
      res.status(400).json({ error: "Stripe webhook not configured" });
      return;
    }

    const sig = req.headers["stripe-signature"] as string;
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        (req as Request & { rawBody?: Buffer }).rawBody ?? req.body,
        sig,
        STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      logger.warn("Stripe webhook signature failed");
      res.status(400).json({ error: "Webhook signature verification failed" });
      return;
    }

    try {
      logger.info({ eventType: event.type, eventId: event.id }, "Stripe webhook received");
      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const sub = event.data.object as Stripe.Subscription;
          const userId = sub.metadata?.userId;
          const plan = (sub.metadata?.plan ?? "signals") as ProductPlan;
          if (!userId) {
            logger.warn({ eventType: event.type, eventId: event.id, subscriptionId: sub.id }, "Webhook received subscription event with no userId in metadata — subscription state not updated");
            break;
          }

          const existing = await db
            .select()
            .from(subscriptionsTable)
            .where(eq(subscriptionsTable.stripeSubscriptionId, sub.id))
            .limit(1);

          const periodEnd = sub.items.data[0]?.current_period_end
            ? new Date((sub.items.data[0].current_period_end as unknown as number) * 1000)
            : null;

          const statusMap: Record<string, "active" | "past_due" | "canceled" | "trialing" | "incomplete"> = {
            active: "active",
            past_due: "past_due",
            canceled: "canceled",
            trialing: "trialing",
            incomplete: "incomplete",
            incomplete_expired: "canceled",
            unpaid: "past_due",
          };
          const status = statusMap[sub.status] ?? "incomplete";

          if (existing.length > 0) {
            await db
              .update(subscriptionsTable)
              .set({ status, plan, currentPeriodEnd: periodEnd, updatedAt: new Date() } as object)
              .where(eq(subscriptionsTable.stripeSubscriptionId, sub.id));
          } else {
            await db.insert(subscriptionsTable).values({
              id: randomUUID(),
              userId,
              stripeSubscriptionId: sub.id,
              stripeCustomerId: sub.customer as string,
              plan,
              status,
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: sub.cancel_at_period_end ? "true" : "false",
            });
          }
          break;
        }
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          await db
            .update(subscriptionsTable)
            .set({ status: "canceled", updatedAt: new Date() } as object)
            .where(eq(subscriptionsTable.stripeSubscriptionId, sub.id));
          break;
        }
        default:
          break;
      }
      res.json({ received: true });
    } catch (err) {
      logger.error(err, "Webhook handler error");
      res.status(500).json({ error: "Webhook handling failed" });
    }
  }
);

// ── GET /api/stripe/subscription ──────────────────────────────────────────────
router.get("/subscription", requireAuth, async (req: Request, res: Response) => {
  const user = req.dbUser!;
  const subs = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, user.id))
    .limit(1);

  if (subs.length === 0) {
    res.json({ subscription: null });
    return;
  }
  res.json({ subscription: subs[0] });
});

export default router;
