import type Stripe from "stripe";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db, subscriptionsTable, usersTable } from "./db.js";
import { logger } from "./logger.js";
import { getStripe, PRICE_SIGNALS, PRICE_MENTORSHIP, PRICE_MEMBERSHIP } from "./stripeClient.js";

export type ProductPlan = "signals" | "mentorship" | "membership";

const STATUS_MAP: Record<string, "active" | "past_due" | "canceled" | "trialing" | "incomplete"> = {
  active: "active",
  past_due: "past_due",
  canceled: "canceled",
  trialing: "trialing",
  incomplete: "incomplete",
  incomplete_expired: "canceled",
  unpaid: "past_due",
};

/**
 * Figures out which of our three plans a Stripe subscription belongs to.
 *
 * Prefers `metadata.plan`, which is what our own /api/stripe/create-checkout
 * flow stamps on every subscription it creates. Falls back to matching the
 * subscription's price/product against the configured STRIPE_PRICE_* env
 * vars — this is what lets reconciliation work for subscriptions that were
 * never created through our checkout at all (e.g. one added directly in the
 * Stripe dashboard to test a member account), which have no metadata.
 */
export function resolvePlanForSubscription(sub: Stripe.Subscription): ProductPlan {
  const metaPlan = sub.metadata?.plan;
  if (metaPlan === "signals" || metaPlan === "mentorship" || metaPlan === "membership") {
    return metaPlan;
  }

  const price = sub.items.data[0]?.price;
  if (price) {
    const productId = typeof price.product === "string" ? price.product : price.product?.id;
    const candidates: Array<[string | undefined, ProductPlan]> = [
      [PRICE_MENTORSHIP, "mentorship"],
      [PRICE_MEMBERSHIP, "membership"],
      [PRICE_SIGNALS, "signals"],
    ];
    for (const [configured, plan] of candidates) {
      if (!configured) continue;
      if (configured === price.id || configured === productId) return plan;
    }
  }

  // No metadata and no price match (e.g. a one-off test price) — default to
  // the base plan rather than dropping the subscription on the floor.
  return "signals";
}

async function upsertSubscriptionRow(userId: string, sub: Stripe.Subscription, plan: ProductPlan): Promise<void> {
  const periodEnd = sub.items.data[0]?.current_period_end
    ? new Date((sub.items.data[0].current_period_end as unknown as number) * 1000)
    : null;
  const status = STATUS_MAP[sub.status] ?? "incomplete";

  const existing = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.stripeSubscriptionId, sub.id))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(subscriptionsTable)
      .set({
        status,
        plan,
        currentPeriodEnd: periodEnd,
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
}

/**
 * Reconciles a user's local subscription rows against Stripe directly.
 *
 * Our local `subscriptions` table is normally kept in sync by the Stripe
 * webhook (customer.subscription.*). That's fast, but it has gaps that show
 * up as "I added/changed a subscription and the app still shows the
 * paywall":
 *
 *   1. A subscription added or edited directly in the Stripe dashboard
 *      (e.g. to test a member account) fires the same webhook event, but
 *      has no metadata.userId — previously the webhook handler just logged
 *      a warning and silently skipped writing anything to our DB.
 *   2. That dashboard subscription may even be on a brand-new Stripe
 *      Customer that was never linked to this user locally (our own
 *      checkout flow is what normally creates and stores
 *      `stripeCustomerId` — a subscription added by hand may not go
 *      through it at all). Falls back to looking the customer up by email
 *      in that case.
 *   3. Webhook delivery can lag or, rarely, get missed entirely, leaving
 *      the local row stale for a window.
 *
 * Calling this before we decide whether someone is entitled to paid content
 * makes Stripe itself the source of truth for "is this person paying"
 * instead of trusting only whatever happened to already land locally. It's
 * called from GET /api/auth/subscription and GET /api/stripe/subscription —
 * the two endpoints the web and mobile clients use to gate paid content.
 */
export async function syncSubscriptionsFromStripe(user: {
  id: string;
  email: string;
  stripeCustomerId: string | null;
}): Promise<void> {
  const stripe = getStripe();
  if (!stripe) return;

  try {
    let customerId = user.stripeCustomerId;

    if (!customerId) {
      const found = await stripe.customers.list({ email: user.email, limit: 1 });
      const match = found.data[0];
      if (!match) return;
      customerId = match.id;
      await db
        .update(usersTable)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(usersTable.id, user.id));
    }

    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
    });

    for (const sub of subs.data) {
      await upsertSubscriptionRow(user.id, sub, resolvePlanForSubscription(sub));
    }
  } catch (err) {
    // Reconciliation failing shouldn't break the read entirely — fall back
    // to whatever's already in the local table (normally still correct via
    // the webhook) rather than 500ing the whole subscription check.
    logger.error(err, "Stripe subscription reconciliation failed");
  }
}
