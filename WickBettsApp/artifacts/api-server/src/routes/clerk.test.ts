/**
 * Smoke tests for the Clerk-backed auth stack.
 *
 * Strategy
 * ────────
 * These tests do NOT use mock.module() or any module-level mocking, which is
 * unreliable in an esbuild-bundled environment.  Instead they call the exported
 * middleware functions directly with mock req/res/next objects and a real
 * database connection, seeding isolated test rows (emails in the
 * @smoke-test.invalid domain) and cleaning them up afterward.
 *
 * Coverage
 * ────────
 *  1. requireAuth — 401 when getAuth returns no userId (no Clerk session)
 *  2. jitProvisionUser — creates a new users row on first call
 *  3. jitProvisionUser — returns the existing row on subsequent calls
 *  4. requireActiveSubscription — 403 SUBSCRIPTION_REQUIRED when no active sub
 *  5. requireActiveSubscription — calls next() for active subscription
 *  6. requireActiveSubscription — calls next() for trialing subscription
 *  7. requireActiveSubscription — 403 for canceled subscription
 *  8. requireAdmin — 403 for a member
 *  9. requireAdmin — calls next() for an admin
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";

// ─── Application under test ───────────────────────────────────────────────────

import { jitProvisionUser, requireAdmin, requireAuth } from "../middlewares/requireAuth.js";
import { requireActiveSubscription } from "../routes/signals.js";
import { db, usersTable, subscriptionsTable } from "../lib/db.js";
import { eq } from "drizzle-orm";

// ─── Test-data helpers ────────────────────────────────────────────────────────

const TEST_DOMAIN = "@smoke-test.invalid";

// Accumulate IDs for cleanup
const insertedUserIds: string[] = [];
const insertedSubIds: string[] = [];

/**
 * Seed a users row in the real database and track it for cleanup.
 */
async function seedUser(overrides: {
  email: string;
  name?: string;
  role?: "member" | "admin";
}) {
  const id = randomUUID();
  await db.insert(usersTable).values({
    id,
    email: overrides.email,
    name: overrides.name ?? "Smoke Test",
    role: overrides.role ?? "member",
  });
  insertedUserIds.push(id);
  return { id, email: overrides.email, name: overrides.name ?? "Smoke Test", role: overrides.role ?? "member" };
}

/**
 * Seed a subscriptions row and track it for cleanup.
 */
async function seedSubscription(
  userId: string,
  plan: "signals" | "mentorship" | "membership" = "signals",
  status: "active" | "trialing" | "canceled" | "past_due" | "incomplete" = "active",
  currentPeriodEnd?: Date,
) {
  const id = randomUUID();
  await db.insert(subscriptionsTable).values({
    id,
    userId,
    plan,
    status,
    stripeSubscriptionId: `sub_smoke_${id}`,
    stripeCustomerId: `cus_smoke_${id}`,
    currentPeriodEnd: currentPeriodEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  } as any);
  insertedSubIds.push(id);
  return { id, userId, status };
}

// ─── Mock req/res/next builders ───────────────────────────────────────────────

type MockRes = {
  _status: number | null;
  _body: unknown;
  status: (code: number) => MockRes;
  json: (body: unknown) => void;
};

function makeMockRes(): MockRes {
  const res: MockRes = {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; },
  };
  return res;
}

function makeMockReq(dbUser?: object): Partial<Request> {
  return { dbUser: dbUser as Request["dbUser"] };
}

// ─── Global cleanup ───────────────────────────────────────────────────────────

after(async () => {
  for (const id of insertedSubIds) {
    await db.delete(subscriptionsTable).where(eq(subscriptionsTable.id, id)).catch(() => {});
  }
  for (const id of insertedUserIds) {
    await db.delete(usersTable).where(eq(usersTable.id, id)).catch(() => {});
  }
  // Clean up any JIT-provisioned rows created by the provisioning tests
  await db
    .delete(usersTable)
    .where(eq(usersTable.email, `jit-new${TEST_DOMAIN}`))
    .catch(() => {});
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. requireAuth — 401 when there is no Clerk session
// ══════════════════════════════════════════════════════════════════════════════

test("requireAuth returns 401 when getAuth returns no userId", async () => {
  // Keep this test deterministic: inject the auth shape directly on req instead
  // of relying on Clerk middleware/key parsing in CI.
  const req = { auth: { userId: null } } as unknown as Request;
  const res = makeMockRes();
  let nextCalled = false;

  requireAuth(req, res as unknown as Response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false, "next() must not be called");
  assert.equal(res._status, 401, `expected 401 got ${res._status}`);
  assert.ok((res._body as { error?: string })?.error, "error field must be present in 401 response");
});

// ══════════════════════════════════════════════════════════════════════════════
// 2 & 3. jitProvisionUser — JIT provisioning and idempotency
// ══════════════════════════════════════════════════════════════════════════════

test("jitProvisionUser creates a new users row on first call", async () => {
  const email = `jit-new${TEST_DOMAIN}`;

  // Ensure no leftover row from a previous run
  await db.delete(usersTable).where(eq(usersTable.email, email)).catch(() => {});

  const user = await jitProvisionUser({ email, firstName: "Jit", lastName: "Provision", username: "" });

  assert.ok(user, "jitProvisionUser must return a user object");
  assert.equal(user!.email, email);
  assert.equal(user!.name, "Jit Provision");
  assert.equal(user!.role, "member");

  // Verify the row is in the real database
  const rows = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  assert.equal(rows.length, 1, "exactly one row must exist in the database");
  insertedUserIds.push(rows[0]!.id);
});

test("jitProvisionUser returns the existing row on subsequent calls (no duplicate)", async () => {
  const email = `existing${TEST_DOMAIN}`;
  const seeded = await seedUser({ email, name: "Already There" });

  const user = await jitProvisionUser({ email, firstName: "Already", lastName: "There", username: "" });

  assert.ok(user, "must return a user");
  assert.equal(user!.id, seeded.id, "must return the pre-existing row id");

  // No duplicate should have been created
  const rows = await db.select().from(usersTable).where(eq(usersTable.email, email));
  assert.equal(rows.length, 1, "only one row must exist — no duplicate");
});

// ══════════════════════════════════════════════════════════════════════════════
// 4–7. requireActiveSubscription gate
// ══════════════════════════════════════════════════════════════════════════════

test("requireActiveSubscription — 403 SUBSCRIPTION_REQUIRED when user has no subscription", async () => {
  const user = await seedUser({ email: `nosub${TEST_DOMAIN}`, role: "member" });
  const req = makeMockReq(user);
  const res = makeMockRes();
  let nextCalled = false;

  await requireActiveSubscription(req as Request, res as unknown as Response, () => { nextCalled = true; });

  assert.equal(nextCalled, false, "next() must not be called");
  assert.equal(res._status, 403, `expected status 403, got ${res._status}`);
  assert.equal((res._body as { code?: string })?.code, "SUBSCRIPTION_REQUIRED");
});

test("requireActiveSubscription — calls next() for active subscription", async () => {
  const user = await seedUser({ email: `active${TEST_DOMAIN}`, role: "member" });
  await seedSubscription(user.id, "signals", "active");
  const req = makeMockReq(user);
  const res = makeMockRes();
  let nextCalled = false;

  await requireActiveSubscription(req as Request, res as unknown as Response, () => { nextCalled = true; });

  assert.equal(nextCalled, true, "next() must be called for an active subscription");
});

test("requireActiveSubscription — calls next() for trialing subscription", async () => {
  const user = await seedUser({ email: `trialing${TEST_DOMAIN}`, role: "member" });
  await seedSubscription(user.id, "signals", "trialing");
  const req = makeMockReq(user);
  const res = makeMockRes();
  let nextCalled = false;

  await requireActiveSubscription(req as Request, res as unknown as Response, () => { nextCalled = true; });

  assert.equal(nextCalled, true, "next() must be called for a trialing subscription");
});

test("requireActiveSubscription — 403 for canceled subscription", async () => {
  const user = await seedUser({ email: `canceled${TEST_DOMAIN}`, role: "member" });
  await seedSubscription(user.id, "signals", "canceled");
  const req = makeMockReq(user);
  const res = makeMockRes();
  let nextCalled = false;

  await requireActiveSubscription(req as Request, res as unknown as Response, () => { nextCalled = true; });

  assert.equal(nextCalled, false, "next() must not be called for a canceled subscription");
  assert.equal(res._status, 403);
  assert.equal((res._body as { code?: string })?.code, "SUBSCRIPTION_REQUIRED");
});

test("requireActiveSubscription — calls next() for active membership subscription", async () => {
  const user = await seedUser({ email: `membership${TEST_DOMAIN}`, role: "member" });
  await seedSubscription(user.id, "membership", "active");
  const req = makeMockReq(user);
  const res = makeMockRes();
  let nextCalled = false;

  await requireActiveSubscription(req as Request, res as unknown as Response, () => { nextCalled = true; });

  assert.equal(nextCalled, true, "next() must be called for an active membership subscription");
});

// ══════════════════════════════════════════════════════════════════════════════
// 8 & 9. requireAdmin gate
// ══════════════════════════════════════════════════════════════════════════════

test("requireAdmin — 403 for a member", () => {
  const req = makeMockReq({ id: "u1", role: "member" });
  const res = makeMockRes();
  let nextCalled = false;

  requireAdmin(req as Request, res as unknown as Response, () => { nextCalled = true; });

  assert.equal(nextCalled, false, "next() must not be called for a member");
  assert.equal(res._status, 403);
});

test("requireAdmin — calls next() for an admin", () => {
  const req = makeMockReq({ id: "u1", role: "admin" });
  const res = makeMockRes();
  let nextCalled = false;

  requireAdmin(req as Request, res as unknown as Response, () => { nextCalled = true; });

  assert.equal(nextCalled, true, "next() must be called for an admin");
});
