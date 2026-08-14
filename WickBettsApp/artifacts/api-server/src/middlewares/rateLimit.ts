import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";

/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * Hand-rolled instead of pulling in `express-rate-limit` because this
 * repo's Docker build runs `pnpm install --frozen-lockfile` and there's no
 * way to regenerate `pnpm-lock.yaml` outside a real dev environment — an
 * unplanned new dependency here would break the next deploy. See
 * docs/adr/0004-security-hardening.md for the full reasoning.
 *
 * Known limitation: this is per-process, in-memory state. WickBettsAPP
 * currently runs a single replica (see railway config), so this is
 * effective as-is. If replica count is ever raised above 1, each replica
 * would track its own counters independently, which softens the effective
 * limit proportionally — move to a shared store (e.g. Postgres or Redis)
 * at that point rather than assuming this continues to hold the line.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodic sweep so `buckets` doesn't grow unbounded from one-off IPs that
// never come back (e.g. scanners hitting the API once and moving on).
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, SWEEP_INTERVAL_MS).unref();

function clientKey(req: Request): string {
  // `trust proxy` is enabled in app.ts, so req.ip resolves the real client
  // address from Railway's X-Forwarded-For rather than Railway's internal
  // proxy IP (which would otherwise bucket every user together).
  return req.ip ?? "unknown";
}

export interface RateLimitOptions {
  /** Max requests allowed per window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Short label used in logs to identify which limiter tripped. */
  name: string;
}

/**
 * Returns an Express middleware enforcing `max` requests per `windowMs`
 * per client IP. Intended for cheap, coarse protection against scripted
 * abuse and accidental retry storms — not a substitute for edge-level
 * DDoS mitigation (Cloudflare/Railway), which operates below the
 * application layer and should still be the first line of defense for
 * volumetric attacks.
 */
export function rateLimit({ max, windowMs, name }: RateLimitOptions) {
  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const key = `${name}:${clientKey(req)}`;
    const now = Date.now();
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (existing.count >= max) {
      const retryAfterSec = Math.ceil((existing.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      logger.warn({ limiter: name, ip: clientKey(req), path: req.path }, "Rate limit exceeded");
      res.status(429).json({ error: "Too many requests. Try again shortly." });
      return;
    }

    existing.count += 1;
    next();
  };
}

// Two presets covering the actual risk areas in this app:
//   - `apiRateLimit`: general-purpose ceiling applied to all /api routes,
//     generous enough not to bother real usage but enough to blunt simple
//     scripted hammering.
//   - `aiRateLimit`: tighter limit for routes that call a paid,
//     latency-heavy external AI API (trade review, screenshot scanning) —
//     these are the routes where abuse is both cheapest to trigger and
//     most expensive to us.
export const apiRateLimit = rateLimit({ name: "api", max: 300, windowMs: 5 * 60 * 1000 });
export const aiRateLimit = rateLimit({ name: "ai", max: 10, windowMs: 10 * 60 * 1000 });
