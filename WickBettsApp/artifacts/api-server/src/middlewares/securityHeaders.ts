import type { Request, Response, NextFunction } from "express";

/**
 * Minimal set of hardening response headers, hand-rolled instead of adding
 * the `helmet` package — same lockfile constraint noted in rateLimit.ts.
 * This covers the headers that matter for an API + SPA-shell server like
 * this one; it deliberately does NOT set a strict Content-Security-Policy,
 * since the static web export (artifacts/wick-betts/dist/public) isn't
 * audited against one here and a wrong CSP would silently break the app
 * rather than fail loudly. Revisit if/when that bundle's script/style
 * sources are enumerated.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  // Prevent MIME-sniffing a response into a different content type than
  // declared (mitigates some stored-content XSS vectors).
  res.setHeader("X-Content-Type-Options", "nosniff");
  // This app is not meant to be framed by another site.
  res.setHeader("X-Frame-Options", "DENY");
  // Don't leak full referrer URLs (which can contain auth tokens in query
  // strings on some third-party redirect flows) to cross-origin requests.
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // HSTS — Railway terminates TLS in front of this service, so this is
  // safe to send unconditionally; browsers ignore it over plain HTTP.
  res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  // Disable legacy browser features/APIs this app has no use for.
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  next();
}
