import { type Request, type Response, type NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db, usersTable } from "../lib/db.js";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger.js";
import { generateUniqueReferralCode } from "../lib/referralCode.js";

const SUPER_ADMIN_EMAIL = "bettstahlik@gmail.com";

/**
 * Bootstrap admin emails — accounts that are always granted the "admin" role
 * on login/JIT-provision, regardless of what's in the DB. This exists so a
 * dev/test account (or a new team member) can get admin access without
 * anyone needing direct DB access to flip their role.
 *
 * The primary super-admin email is always included. Add more via the
 * BOOTSTRAP_ADMIN_EMAILS env var (comma-separated), e.g.:
 *   BOOTSTRAP_ADMIN_EMAILS=dev@wickbetts.local,teammate@example.com
 */
const bootstrapAdminEmails = new Set(
  [SUPER_ADMIN_EMAIL, ...(process.env.BOOTSTRAP_ADMIN_EMAILS ?? "").split(",")]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

export function isBootstrapAdmin(email: string): boolean {
  return bootstrapAdminEmails.has(email.trim().toLowerCase());
}

function getDevAuthMode(): string {
  return (process.env.DEV_AUTH_MODE ?? process.env.AUTH_BYPASS_MODE ?? "").trim().toLowerCase();
}

// SECURITY: this must never trust the Host or Origin headers — both are
// entirely attacker-controlled on any request reaching this process (a raw
// HTTP client can send `Host: localhost` or `Origin: http://localhost` to a
// public server just as easily as a real local request would). The previous
// implementation checked exactly those headers, which meant that if
// DEV_AUTH_MODE/AUTH_BYPASS_MODE were ever set on a reachable deployment
// with NODE_ENV != "production" (e.g. a staging environment spun up for
// testing), anyone on the internet could authenticate as the configured dev
// user — including as an admin, if DEV_AUTH_ROLE=admin or DEV_AUTH_EMAIL
// matched a bootstrap admin — by simply spoofing one header. `req.ip` is not
// spoofable the same way: with `trust proxy: 1` set in app.ts, it reflects
// the address Railway's edge actually saw the connection come from, which an
// external client cannot forge by adding request headers.
function isLocalRequest(req: Request): boolean {
  const ip = req.ip ?? req.socket.remoteAddress ?? "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function isDevAuthEnabled(req: Request): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const mode = getDevAuthMode();
  return (mode === "localhost" || mode === "dev") && isLocalRequest(req);
}

async function provisionDevUser(req: Request): Promise<import("@workspace/db").User | null> {
  const email = process.env.DEV_AUTH_EMAIL?.trim() || "dev@wickbetts.local";
  const firstName = process.env.DEV_AUTH_FIRST_NAME?.trim() || "Dev";
  const lastName = process.env.DEV_AUTH_LAST_NAME?.trim() || "User";
  const username = process.env.DEV_AUTH_USERNAME?.trim() || "";
  const role = (process.env.DEV_AUTH_ROLE?.trim() === "admin" || isBootstrapAdmin(email)) ? "admin" : "member";

  const user = await jitProvisionUser({ email, firstName, lastName, username, referralCode: "" });
  if (!user) return null;

  if (role === "admin" && user.role !== "admin") {
    try {
      await db.update(usersTable).set({ role: "admin", updatedAt: new Date() }).where(eq(usersTable.id, user.id));
      return { ...user, role: "admin" as const };
    } catch (err) {
      logger.warn(err, "provisionDevUser: could not promote dev user to admin");
    }
  }

  logger.info({ email, mode: getDevAuthMode() }, "Dev auth bypass provisioned local test user");
  return user;
}

function isClerkConfigured(): boolean {
  return Boolean(
    process.env.CLERK_SECRET_KEY?.trim()
      || process.env.CLERK_SECRET?.trim()
      || process.env.CLERK_API_KEY?.trim()
  );
}

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
  username: string;
  referralCode: string;
} | null> {
  try {
    const clerkUser = await clerkClient.users.getUser(userId);
    const emailObj = clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId,
    );
    if (!emailObj?.emailAddress) return null;
    const unsafeMetadata = clerkUser.unsafeMetadata as { username?: unknown; referralCode?: unknown } | undefined;
    return {
      email: emailObj.emailAddress,
      firstName: clerkUser.firstName ?? "",
      lastName: clerkUser.lastName ?? "",
      username: typeof unsafeMetadata?.username === "string" ? unsafeMetadata.username.trim() : "",
      // Set by the mobile sign-up screen (app/sign-up.tsx) when the account
      // was created from a referral link/code. Only ever read on the very
      // first provisioning of a user row — see the `if (!user)` branch
      // below — so there's no way to retroactively attribute an existing
      // account by setting this metadata after the fact.
      referralCode: typeof unsafeMetadata?.referralCode === "string" ? unsafeMetadata.referralCode.trim() : "",
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
  username: string;
  /** Referral code the account was created with, if any — see resolveClerkIdentity. */
  referralCode?: string;
}): Promise<import("@workspace/db").User | null> {
  const { email, firstName, lastName, username } = identity;

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
      username || [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0];
    const role =
      isBootstrapAdmin(email) ? ("admin" as const) : ("member" as const);

    // Referral attribution (docs/referral-program-plan.md) — best-effort:
    // a failure here should never block account creation, so both steps
    // are individually try/caught and simply omitted from the insert on
    // failure. A missing own referral code is backfilled lazily by
    // GET /api/referrals/me the first time this member opens that screen.
    let referredByUserId: string | undefined;
    const referralCodeInput = identity.referralCode?.trim();
    if (referralCodeInput) {
      try {
        const [referrer] = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.referralCode, referralCodeInput.toUpperCase()))
          .limit(1);
        if (referrer) referredByUserId = referrer.id;
      } catch (err) {
        logger.warn(err, "jitProvisionUser: referral code lookup failed, continuing without attribution");
      }
    }

    let ownReferralCode: string | undefined;
    try {
      ownReferralCode = await generateUniqueReferralCode();
    } catch (err) {
      logger.warn(err, "jitProvisionUser: failed to generate a referral code up front, will backfill lazily");
    }

    try {
      await db
        .insert(usersTable)
        .values({
          id: randomUUID(),
          email,
          name,
          role,
          ...(ownReferralCode ? { referralCode: ownReferralCode } : {}),
          ...(referredByUserId ? { referredByUserId } : {}),
        })
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
    logger.info({ userId: user.id, email, referredByUserId }, "New user JIT-provisioned via Clerk");
  }

  // Always enforce bootstrap-admin role regardless of what the DB row says
  if (isBootstrapAdmin(email) && user.role !== "admin") {
    try {
      await db
        .update(usersTable)
        .set({ role: "admin", updatedAt: new Date() })
        .where(eq(usersTable.id, user.id));
      user = { ...user, role: "admin" as const };
    } catch (err) {
      logger.warn(err, "jitProvisionUser: could not enforce bootstrap-admin role");
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
  if (isDevAuthEnabled(req)) {
    void (async () => {
      const user = await provisionDevUser(req);
      if (!user) {
        res.status(500).json({ error: "Failed to provision dev test user" });
        return;
      }
      req.dbUser = user;
      next();
    })().catch((err) => {
      logger.error(err, "requireAuth: dev auth bypass failed");
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    });
    return;
  }

  if (!isClerkConfigured()) {
    res.status(401).json({ error: "Authentication is not configured" });
    return;
  }

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
