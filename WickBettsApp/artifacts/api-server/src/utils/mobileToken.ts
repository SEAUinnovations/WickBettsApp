import { createHmac, timingSafeEqual } from "crypto";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function secret(): string {
  return process.env.SESSION_SECRET ?? "dev-secret-please-set-SESSION_SECRET";
}

/**
 * Generate a stateless HMAC-signed mobile token.
 * Format: `{userId}.{timestamp}.{hex-signature}`
 * UUIDs use hyphens (not dots), so splitting on "." gives exactly 3 parts.
 */
export function generateMobileToken(userId: string): string {
  const timestamp = Date.now().toString();
  const payload = `${userId}.${timestamp}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

/**
 * Verify a mobile token. Returns the userId if valid, or null if invalid/expired.
 */
export function verifyMobileToken(token: string): string | null {
  const dotCount = (token.match(/\./g) ?? []).length;
  if (dotCount < 2) return null;

  // Last segment is the signature, second-to-last is timestamp, rest is userId
  const lastDot = token.lastIndexOf(".");
  const secondLastDot = token.lastIndexOf(".", lastDot - 1);
  const userId = token.slice(0, secondLastDot);
  const timestamp = token.slice(secondLastDot + 1, lastDot);
  const sig = token.slice(lastDot + 1);

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Date.now() - ts > THIRTY_DAYS_MS) return null;

  const payload = `${userId}.${timestamp}`;
  const expected = createHmac("sha256", secret()).update(payload).digest("hex");

  try {
    const sigBuf = Buffer.from(sig, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expBuf)) return null;
  } catch {
    return null;
  }

  return userId;
}
