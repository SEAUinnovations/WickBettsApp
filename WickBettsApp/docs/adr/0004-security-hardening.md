# 0004: API security hardening — what's covered and what isn't

## Status

Accepted.

## Context

A request to "remove vulnerabilities from attacks and DDoS" prompted a
pass over `artifacts/api-server`'s security posture. Found and fixed:

1. **CORS origin check for `localhost` was unanchored.** The regex was
   `/localhost/` with no `^`/`$` anchors, so it matched "localhost"
   *anywhere* in an Origin header — an attacker-controlled origin like
   `https://localhost.evil.com` would have passed this check and been
   granted CORS access with credentials. The `wickbetts.com` pattern was
   already correctly anchored; the localhost one wasn't. Fixed to
   `/^https?:\/\/localhost(:\d+)?$/i` and an equivalent `127.0.0.1`
   pattern.
2. **No `trust proxy` setting.** Railway terminates TLS and proxies to
   this container, so `req.ip` resolved to Railway's internal proxy
   address for every request, not the real client. This matters for the
   rate limiter added below (would have bucketed all users together
   under one key) and for anything else that might reason about client
   IP in the future. Set to `1` (trust exactly one hop) rather than
   `true` (trust the entire `X-Forwarded-For` chain, which is spoofable
   by the client).
3. **No rate limiting anywhere.** Added a hand-rolled in-memory
   fixed-window limiter (`middlewares/rateLimit.ts`) — a general
   300-req/5min-per-IP ceiling on all `/api` routes, plus a tighter
   10-req/10min ceiling on the two routes that call a paid external AI
   API (`POST /api/trade-reviews`, `POST /api/admin/extract-signal`),
   since those are both the cheapest routes to abuse and the most
   expensive to us per request.
4. **No security response headers.** Added `middlewares/securityHeaders.ts`
   setting `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
   `Strict-Transport-Security`, and a restrictive `Permissions-Policy`.
   Deliberately does NOT set a `Content-Security-Policy` — the static web
   bundle's actual script/style sources haven't been audited against one,
   and a wrong CSP fails silently (breaks the app) rather than loudly.
5. **`X-Powered-By: Express` was on by default,** trivially fingerprinting
   the stack. Disabled.
6. **JSON body limit was a blanket 15mb** (raised from Express's 100kb
   default to fit base64 chart screenshots, then found to be wider than
   necessary). Reduced to 6mb — still comfortable headroom for a
   client-compressed screenshot, but caps how much memory an
   *unauthenticated* request can force the process to allocate, since body
   parsing in Express runs before any route-level auth middleware.

## Decision: no new npm dependencies for any of this

`express-rate-limit` and `helmet` are the standard packages for #3 and #4.
Neither was added. This repo's Docker build runs
`pnpm install --frozen-lockfile`, and there was no execution environment
available in this session to run `pnpm install` and regenerate
`pnpm-lock.yaml` — introducing an unresolved new dependency would fail
the very next deploy. The hand-rolled versions in `middlewares/` cover
this app's actual surface area (a handful of routes, single Railway
replica) without that risk. If/when a real dev environment updates the
lockfile, swapping in the standard packages is a reasonable follow-up but
not a requirement — the hand-rolled versions are not toy implementations,
they're scoped deliberately to what this app needs.

## Known limitations, explicitly not fixed here

- **Rate limiting is per-process, in-memory state.** `WickBettsAPP`
  currently runs a single Railway replica, so this holds. If replica
  count is ever raised, each replica tracks its own counters
  independently and the effective limit softens proportionally — move to
  a shared store (Postgres, Redis) at that point.
- **This is not DDoS protection.** Volumetric/network-layer attacks are
  mitigated at the edge (Cloudflare, Railway's own infrastructure), below
  the application layer where this code runs. The web frontend
  (wickbetts.com) already goes through a Cloudflare Worker; the API
  domain (`wickbettsapp-production.up.railway.app` / any custom API
  domain) does not currently sit behind Cloudflare's proxy. Recommended
  follow-up: proxy the API domain through Cloudflare too (orange-cloud
  the DNS record) for real edge-level DDoS mitigation — this is a
  DNS/dashboard change, not something fixed in application code, and
  wasn't made here.
- **No per-route body size scoping.** The 6mb limit is global. Express
  consumes the request body stream once via the first body parser that
  runs (`app.use(express.json())` at the app level, before any route),
  so a smaller global default with a larger override on just the two
  image-upload routes isn't achievable without moving body parsing to be
  per-router instead of global — a larger refactor than this pass
  covered. Authentication (`requireAuth`) also currently runs after body
  parsing, so an unauthenticated request can still force up to 6mb of
  parsing work; this is a real, accepted trade-off, not an oversight.
- **No CSP.** See #4 above.
- **SQL injection:** not separately hardened here because it wasn't found
  to be a gap — every query in this codebase goes through Drizzle's
  parameterized query builder; there's no raw string interpolation into
  SQL anywhere in `routes/` or `services/`.
