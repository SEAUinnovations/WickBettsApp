import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import { db, usersTable, subscriptionsTable } from "../lib/db.js";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { pickPrimarySubscription } from "../lib/subscriptionUtils.js";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const PRICE_SIGNALS = process.env.STRIPE_PRICE_SIGNALS;
const PRICE_MENTORSHIP = process.env.STRIPE_PRICE_MENTORSHIP;
const PRICE_MEMBERSHIP = process.env.STRIPE_PRICE_MEMBERSHIP;

// Trade review credits are a fixed $2.50 one-time add-on, not a
// subscription plan — built with Stripe's inline `price_data` rather than
// a pre-created Price/Product ID (like PRICE_SIGNALS etc. above) since the
// amount is fixed and doesn't need catalog management or another env var
// for ops to configure. See docs/adr/0003-trade-review-ai-provider.md.
const TRADE_REVIEW_CREDIT_PRICE_CENTS = 250;

type ProductPlan = "signals" | "mentorship" | "membership";
const ALLOWED_PLANS: ProductPlan[] = ["signals", "mentorship", "membership"];

/**
 * Resolves a configured STRIPE_PRICE_* env value to an actual Stripe Price ID.
 *
 * These env vars have historically been set to Stripe *Product* IDs
 * (`prod_...`) rather than *Price* IDs (`price_...`) — see .env.example. A
 * Checkout Session line item requires a Price ID, so passing a Product ID
 * straight through makes `stripe.checkout.sessions.create` fail for every
 * plan with "No such price". This resolves either shape so checkout works
 * regardless of which one ops configured, and tolerates fixing the env vars
 * later without another code change.
 */
const resolvedPriceIdCache = new Map<string, string>();

async function resolvePriceId(stripe: Stripe, idOrProductId: string): Promise<string> {
  if (idOrProductId.startsWith("price_")) return idOrProductId;

  const cached = resolvedPriceIdCache.get(idOrProductId);
  if (cached) return cached;

  if (idOrProductId.startsWith("prod_")) {
    const prices = await stripe.prices.list({ product: idOrProductId, active: true, limit: 1 });
    const price = prices.data[0];
    if (!price) {
      throw new Error(
        `No active Stripe price found for product "${idOrProductId}". Create a price for this product in the Stripe dashboard.`
      );
    }
    resolvedPriceIdCache.set(idOrProductId, price.id);
    return price.id;
  }

  // Unrecognized ID shape — let Stripe's own error surface rather than guessing.
  return idOrProductId;
}

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

  const { plan } = req.body as { plan?: string };
  if (!plan || !ALLOWED_PLANS.includes(plan as ProductPlan)) {
    res.status(400).json({ error: `Invalid plan. Must be one of: ${ALLOWED_PLANS.join(", ")}` });
    return;
  }

  const configuredId =
    plan === "mentorship"
      ? PRICE_MENTORSHIP
      : plan === "membership"
        ? PRICE_MEMBERSHIP
        : PRICE_SIGNALS;
  if (!configuredId) {
    res.status(503).json({ error: `Stripe price ID for plan "${plan}" is not set.` });
    return;
  }

  const user = req.dbUser!;
  const appOrigin = resolveAppOrigin();

  try {
    const priceId = await resolvePriceId(stripe, configuredId);

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
    const message = err instanceof Error ? err.message : "Failed to create checkout session";
    // Surface price-misconfiguration errors distinctly so they're actionable
    // from the client instead of a generic "something went wrong".
    const isConfigError = message.includes("No active Stripe price found") || message.includes("No such price");
    res.status(isConfigError ? 503 : 500).json({ error: isConfigError ? message : "Failed to create checkout session" });
  }
});

// ── POST /api/stripe/trade-review-credit-checkout ─────────────────────────────
// One-time $2.50 purchase for a single extra Review My Trade credit, used
// once a member exhausts their 4 free reviews for the rolling week (see
// routes/tradeReviews.ts). Separate from create-checkout above because this
// is `mode: "payment"` (a single charge), not `mode: "subscription"`.
router.post("/trade-review-credit-checkout", requireAuth, async (req: Request, res: Response) => {
  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: "Stripe is not configured. Add STRIPE_SECRET_KEY to proceed." });
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
      mode: "payment",
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: TRADE_REVIEW_CREDIT_PRICE_CENTS,
            product_data: {
              name: "Wick Betts — Extra Trade Review",
              description: "One additional Review My Trade submission beyond your weekly free 4.",
            },
          },
          quantity: 1,
        },
      ],
      // Set at both the Session and PaymentIntent level: the webhook
      // handler reads it off `checkout.session.completed`'s session object,
      // but keeping it on the PaymentIntent too means it's still
      // recoverable from the Stripe dashboard/API if that event is ever
      // missed and someone has to reconcile a charge by hand.
      metadata: { userId: user.id, type: "trade_review_credit" },
      payment_intent_data: {
        metadata: { userId: user.id, type: "trade_review_credit" },
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
    logger.error(err, "Trade review credit checkout creation failed");
    res.status(500).json({ error: "Failed to start checkout. Please try again." });
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

// ── POST /api/stripe/cancel-subscription ───────────────────────────────────────
// Cancels the member's current subscription at the end of the paid period —
// they keep access until then, matching standard SaaS cancellation UX and
// avoiding an accidental-tap refund conversation. Explicit in-app action
// (rather than relying solely on the Stripe portal) so cancellation always
// works regardless of how the portal is configured in the Stripe dashboard.
router.post("/cancel-subscription", requireAuth, async (req: Request, res: Response) => {
  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: "Stripe is not configured." });
    return;
  }
  const user = req.dbUser!;
  try {
    const subs = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, user.id));
    const current = pickPrimarySubscription(subs);
    if (!current || (current.status !== "active" && current.status !== "trialing" && current.status !== "past_due")) {
      res.status(400).json({ error: "No active subscription to cancel." });
      return;
    }

    const updated = await stripe.subscriptions.update(current.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // Update immediately rather than waiting on the webhook round-trip so
    // the UI reflects the cancellation right away; the webhook will confirm
    // the same state moments later and is the source of truth going forward.
    const periodEnd = updated.items.data[0]?.current_period_end
      ? new Date((updated.items.data[0].current_period_end as unknown as number) * 1000)
      : current.currentPeriodEnd;
    await db
      .update(subscriptionsTable)
      .set({ cancelAtPeriodEnd: "true", currentPeriodEnd: periodEnd, updatedAt: new Date() } as object)
      .where(eq(subscriptionsTable.id, current.id));

    logger.info({ userId: user.id, subscriptionId: current.stripeSubscriptionId }, "Subscription cancelled at period end");
    res.json({ ok: true, cancelAtPeriodEnd: true, currentPeriodEnd: periodEnd });
  } catch (err) {
    logger.error(err, "Stripe subscription cancellation failed");
    res.status(500).json({ error: "Failed to cancel subscription. Please try again." });
  }
});

// ── POST /api/stripe/resume-subscription ───────────────────────────────────────
// Undoes a pending cancel_at_period_end — lets a member who changes their
// mind keep their subscription without having to re-subscribe from scratch.
router.post("/resume-subscription", requireAuth, async (req: Request, res: Response) => {
  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: "Stripe is not configured." });
    return;
  }
  const user = req.dbUser!;
  try {
    const subs = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, user.id));
    const current = pickPrimarySubscription(subs);
    if (!current || current.cancelAtPeriodEnd !== "true") {
      res.status(400).json({ error: "No pending cancellation to undo." });
      return;
    }

    await stripe.subscriptions.update(current.stripeSubscriptionId, { cancel_at_period_end: false });
    await db
      .update(subscriptionsTable)
      .set({ cancelAtPeriodEnd: "false", updatedAt: new Date() } as object)
      .where(eq(subscriptionsTable.id, current.id));

    logger.info({ userId: user.id, subscriptionId: current.stripeSubscriptionId }, "Subscription cancellation reversed");
    res.json({ ok: true, cancelAtPeriodEnd: false });
  } catch (err) {
    logger.error(err, "Stripe subscription resume failed");
    res.status(500).json({ error: "Failed to resume subscription. Please try again." });
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
              .set({
                status,
                plan,
                currentPeriodEnd: periodEnd,
                // Was previously only written on insert — a member who
                // cancelled (or undid a cancellation) via the portal or the
                // in-app cancel button would never see that reflected here
                // on subsequent renewal/status webhooks.
                cancelAtPeriodEnd: sub.cancel_at_period_end ? "true" : "false",
                updatedAt: new Date(),
              } as object)
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
            } as any);
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
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          // Only the trade-review-credit flow uses mode: "payment" with this
          // metadata shape — subscription checkouts (create-checkout above)
          // are mode: "subscription" and handled entirely by the
          // customer.subscription.* cases, so this only fires for credits.
          if (session.mode === "payment" && session.metadata?.type === "trade_review_credit") {
            const userId = session.metadata.userId;
            if (!userId) {
              logger.warn({ sessionId: session.id }, "Trade review credit checkout completed with no userId in metadata");
              break;
            }
            await db
              .update(usersTable)
              .set({
                extraTradeReviewCredits: sql`${usersTable.extraTradeReviewCredits} + 1`,
                updatedAt: new Date(),
              } as object)
              .where(eq(usersTable.id, userId));
            logger.info({ userId, sessionId: session.id }, "Trade review credit purchased");
          }
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
// Note: the mobile client actually calls GET /api/auth/subscription (same
// logic, kept in sync via pickPrimarySubscription). This route is kept for
// any other consumer that hits /api/stripe/subscription directly.
router.get("/subscription", requireAuth, async (req: Request, res: Response) => {
  const user = req.dbUser!;
  const subs = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, user.id));

  res.json({ subscription: pickPrimarySubscription(subs) });
});

export default router;
