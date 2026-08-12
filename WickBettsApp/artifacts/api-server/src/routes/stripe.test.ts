import { test } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";

const requiredEnv = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_SIGNALS",
  "STRIPE_PRICE_MENTORSHIP",
  "STRIPE_PRICE_MEMBERSHIP",
] as const;

function hasRealStripeConfig(): boolean {
  return requiredEnv.every((key) => {
    const value = process.env[key]?.trim();
    if (!value) return false;
    if (value.includes("placeholder") || value.includes("xxxxxxxx") || value.includes("example")) return false;
    return true;
  });
}

function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  assert.ok(secretKey && !secretKey.includes("placeholder") && !secretKey.includes("xxxxxxxx"), "STRIPE_SECRET_KEY must be set to a real Stripe secret in the test environment");
  return new Stripe(secretKey, { apiVersion: "2026-07-29.dahlia" });
}

test("stripe runtime configuration is defined for checkout and webhooks", () => {
  const missing = requiredEnv.filter((key) => {
    const value = process.env[key]?.trim();
    return !value || value.includes("placeholder") || value.includes("xxxxxxxx");
  });

  if (missing.length > 0) {
    return;
  }

  assert.match(process.env.STRIPE_PUBLISHABLE_KEY ?? "", /^pk_(live|test)_/, "publishable key must be a Stripe test or live key");
  assert.match(process.env.STRIPE_WEBHOOK_SECRET ?? "", /^whsec_/, "webhook secret must look like a Stripe webhook secret");
});

test("Stripe API can create and clean up a customer", { skip: !hasRealStripeConfig() }, async () => {
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: `ci-${Date.now()}@example.com`,
    name: "CI Stripe Validation",
    metadata: { source: "workflow-transaction-test" },
  });

  assert.match(customer.id, /^cus_/);

  await stripe.customers.del(customer.id);
});

test("Stripe can create a subscription checkout session for the signals plan", { skip: !hasRealStripeConfig() }, async () => {
  const stripe = getStripe();
  const priceId = process.env.STRIPE_PRICE_SIGNALS;
  assert.ok(priceId, "STRIPE_PRICE_SIGNALS must be set");

  const customer = await stripe.customers.create({
    email: `signals-${Date.now()}@example.com`,
    name: "Signals Checkout Test",
    metadata: { source: "workflow-transaction-test" },
  });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customer.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: "https://example.com/?checkout=success",
      cancel_url: "https://example.com/?checkout=cancelled",
      metadata: { userId: "ci-user-1", plan: "signals" },
    });

    assert.equal(session.mode, "subscription");
    assert.equal(session.customer, customer.id);
    assert.match(session.id, /^cs_/);
    assert.ok(session.url?.startsWith("https://checkout.stripe.com/"));
  } finally {
    await stripe.customers.del(customer.id).catch(() => undefined);
  }
});

test("Stripe webhook signing works against the configured webhook secret", { skip: !hasRealStripeConfig() }, () => {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  assert.ok(secret, "STRIPE_WEBHOOK_SECRET must be set");

  const payload = JSON.stringify({
    id: "evt_test_123",
    object: "event",
    type: "customer.subscription.created",
    data: {
      object: {
        id: "sub_test_123",
        object: "subscription",
        metadata: { userId: "ci-user-1", plan: "signals" },
        status: "active",
      },
    },
  });

  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });

  const event = stripe.webhooks.constructEvent(payload, header, secret);
  assert.equal(event.type, "customer.subscription.created");
  assert.equal(event.data.object.id, "sub_test_123");
});
