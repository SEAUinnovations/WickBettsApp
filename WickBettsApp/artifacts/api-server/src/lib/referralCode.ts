import { eq } from "drizzle-orm";
import { db, usersTable } from "./db.js";

// Excludes 0/O and 1/I so a code read aloud or typed by hand isn't ambiguous.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 7;

function randomCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Generates a referral code confirmed unique against `users.referral_code`
 * at call time. At 33^7 (~4.2 trillion) combinations a collision on the
 * random draw itself is effectively impossible; this still checks first so
 * a collision surfaces as "try again" here rather than as a thrown unique-
 * constraint violation wherever the caller inserts the row.
 *
 * A small check-then-use race remains if two requests generate the same
 * code in the same instant — acceptable for this feature. If it ever
 * happens, the insert's `onConflictDoNothing()` (see requireAuth.ts) simply
 * skips that write and the caller re-queries, so it fails safe rather than
 * corrupting data.
 */
export async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.referralCode, code))
      .limit(1);
    if (existing.length === 0) return code;
  }
  throw new Error("Failed to generate a unique referral code after 5 attempts");
}
