import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

export const PRICE_SIGNALS = process.env.STRIPE_PRICE_SIGNALS;
export const PRICE_MENTORSHIP = process.env.STRIPE_PRICE_MENTORSHIP;
export const PRICE_MEMBERSHIP = process.env.STRIPE_PRICE_MEMBERSHIP;

export function getStripe(): Stripe | null {
  if (!STRIPE_SECRET_KEY) return null;
  return new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-07-29.dahlia" });
}

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
 *
 * Moved here (out of routes/stripe.ts) so both the checkout route and the
 * subscription-reconciliation logic (lib/subscriptionSync.ts) share one
 * cache and one implementation instead of drifting apart.
 */
const resolvedPriceIdCache = new Map<string, string>();

export async function resolvePriceId(stripe: Stripe, idOrProductId: string): Promise<string> {
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
