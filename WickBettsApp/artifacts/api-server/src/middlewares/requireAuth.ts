import { type Request, type Response, type NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db, usersTable } from "../lib/db.js";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";

const SUPER_ADMIN_EMAIL = "bettstahlik@gmail.com";

/**
 * Resolve the authenticated user's primary email and display name from Clerk.
 *
 * Clerk's default JWT template does not include email or name claims, so we
 * always call the Clerk backend API (clerkClient.users.getUser) to get the
 * canonical email address. The API call is lightweight and cached internally
 * by the Clerk SDK.
 */
async function resolveClerkIdentity(userId: string): Promise<{
  email: string;
  firstName: string;
  lastName: string;
} | null> {
  try {
    const clerkUser = await clerkClient.users.getUser(userId);
    const emailObj = clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId,
    );
    if (!emailObj?.emailAddress) return null;
    return {
      email: emailObj.emailAddress,
      firstName: clerkUser.firstName ?? "",
      lastName: clerkUser.lastName ?? "",
    };
  } catch (err) {
    logger.error(err, "resolveClerkIdentity: Clerk API call failed");
    return null;
  }
}

/**
 * JIT-provision or look up the local users row for a given email address.
 *
 * Exported for testing — callers that already have an authenticated identity
 * (email + display name) can call this directly without going through the
 * full Clerk middleware chain.
 *
 * Returns the local User row, or null if the DB operation fails.
 */
export async function jitProvisionUser(identity: {
  email: string;
  firstName: string;
  lastName: string;
}): Promise<import("@workspace/db").User | null> {
  const { email, firstName, lastName } = identity;

  let rows;
  try {
    rows = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  } catch (err) {
    logger.error(err, "jitProvisionUser: DB lookup failed");
    return null;
  }

  let user = rows[0];

  if (!user) {
    const name =
      [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0];
    const role =
      email === SUPER_ADMIN_EMAIL ? ("admin" as const) : ("member" as const);

    try {
      await db
        .insert(usersTable)
        .values({ id: randomUUID(), email, name, role })
        .onConflictDoNothing();
    } catch {
      // Ignore concurrent first-request race; re-query below resolves it
    }

    try {
      const newRows = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);
      user = newRows[0];
    } catch (err) {
      logger.error(err, "jitProvisionUser: DB re-query after insert failed");
      return null;
    }

    if (!user) return null;
    logger.info({ userId: user.id, email }, "New user JIT-provisioned via Clerk");
  }

  // Always enforce super-admin role regardless of what the DB row says
  if (email === SUPER_ADMIN_EMAIL && user.role !== "admin") {
    try {
      await db
        .update(usersTable)
        .set({ role: "admin", updatedAt: new Date() })
        .where(eq(usersTable.id, user.id));
      user = { ...user, role: "admin" as const };
    } catch (err) {
      logger.warn(err, "jitProvisionUser: could not enforce super-admin role");
    }
  }

  return user;
}

/**
 * Clerk-backed authentication middleware.
 *
 * 1. Verifies the Clerk session (cookie for web, Bearer JWT for mobile).
 * 2. Fetches the user's primary email from the Clerk backend API (the
 *    standard JWT does not include email in its claims).
 * 3. JIT-provisions a local `users` row on the first request after sign-up,
 *    using the email address as the bridge column.
 * 4. Enforces the super-admin role for the primary admin email.
 * 5. Attaches the fully-populated local user to `req.dbUser`.
 *
 * Route handlers should read identity from `req.dbUser`, not from
 * Clerk session claims — the local row carries role, stripeCustomerId,
 * and all other app-specific columns.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  let auth;
  try {
    auth = getAuth(req);
  } catch (err) {
    logger.warn(err, "requireAuth: getAuth failed (missing Clerk context)");
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  if (!auth.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const userId = auth.userId;

  void (async () => {
    const identity = await resolveClerkIdentity(userId);
    if (!identity) {
      res.status(401).json({ error: "Could not resolve authenticated user identity" });
      return;
    }

    const user = await jitProvisionUser(identity);
    if (!user) {
      res.status(500).json({ error: "Failed to provision user account" });
      return;
    }

    req.dbUser = user;
    next();
  })().catch((err) => {
    logger.error(err, "requireAuth: unhandled error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
}

/**
 * Admin-only gate — must follow requireAuth in the middleware chain.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.dbUser || req.dbUser.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
