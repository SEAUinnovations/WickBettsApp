import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware.js";
import { logger } from "./lib/logger.js";
import router from "./routes/index.js";
import { securityHeaders } from "./middlewares/securityHeaders.js";
import { apiRateLimit } from "./middlewares/rateLimit.js";

const app: Express = express();

// Railway terminates TLS and proxies requests to this container, so without
// `trust proxy`, req.ip and the `secure` flag both resolve to Railway's
// internal proxy rather than the real client — which would make the rate
// limiter below bucket every visitor together under one IP. `1` trusts
// exactly one hop (Railway's edge), not an arbitrary X-Forwarded-For chain.
app.set("trust proxy", 1);

// Stop advertising the framework/version in the X-Powered-By header —
// trivial to spoof either way, but no reason to hand attackers a free hint.
app.disable("x-powered-by");

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

// Accept legacy/alternate variable names so production envs do not break
// during migrations between hosting providers or CI setups.
const clerkPublishableKey = firstNonEmpty(
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
  process.env.CLERK_PUBLISHABLE_KEY,
  process.env.CLERK_PUBLISHABLE,
);

const clerkSecretKey = firstNonEmpty(
  process.env.CLERK_SECRET_KEY,
  process.env.CLERK_SECRET,
  process.env.CLERK_API_KEY,
);

const clerkAuthEnabled = Boolean(clerkSecretKey);
if (!clerkAuthEnabled) {
  logger.warn(
    "Missing Clerk Secret Key. Authenticated routes will return 401 until CLERK_SECRET_KEY is configured.",
  );
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDistDir = process.env.WEB_DIST_DIR
  ? path.resolve(process.env.WEB_DIST_DIR)
  : path.resolve(__dirname, "../../wick-betts/dist/public");

// wickbetts.com resolves at both the apex domain and `www.` — those are two
// different browser origins, so both must be allow-listed or every fetch
// from whichever variant isn't in APP_ORIGIN/CORS_ALLOWED_ORIGINS gets
// blocked with "No 'Access-Control-Allow-Origin' header is present" even
// though the API itself is healthy. Match the apex plus any subdomain
// (anchored, so it can't be spoofed by e.g. "wickbetts.com.evil.com" or
// "evilwickbetts.com").
//
// The localhost pattern is anchored the same way — it previously was a bare
// /localhost/ with no start/end anchors, which matches "localhost" ANYWHERE
// in the origin string, so an attacker-controlled origin like
// "https://localhost.evil.com" or "https://evil.com/?x=localhost" would
// have passed this check and been granted CORS + credentials. Anchoring to
// exactly http(s)://localhost[:port] and http(s)://127.0.0.1[:port] closes
// that hole while still covering local dev.
const allowedOriginPatterns: RegExp[] = [
  /^https?:\/\/localhost(:\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/i,
  /^https:\/\/([a-z0-9-]+\.)*wickbetts\.com$/i,
];
if (process.env.CORS_ALLOW_REPLIT_ORIGINS !== "false") {
  allowedOriginPatterns.push(/\.replit\.dev$/, /\.repl\.co$/);
}

const allowedOriginLiterals = new Set(
  [process.env.APP_ORIGIN, process.env.CORS_ALLOWED_ORIGINS]
    .flatMap((value) => (value ?? "").split(","))
    .map((value) => value.trim())
    .filter(Boolean)
);

// ── Logging ───────────────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; },
      res(res) { return { statusCode: res.statusCode }; },
    },
  })
);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(securityHeaders);

// ── Clerk proxy — must come before CORS and body parsers (streams raw bytes) ──
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin(origin, cb) {
      if (
        !origin ||
        allowedOriginLiterals.has(origin) ||
        allowedOriginPatterns.some((p) => p.test(origin))
      ) {
        cb(null, true);
      } else {
        cb(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,
  })
);

// ── Raw body capture for Stripe webhooks ──────────────────────────────────────
app.use((req: Request & { rawBody?: Buffer }, _res: Response, next: NextFunction) => {
  if (req.path === "/api/stripe/webhook") {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      req.rawBody = Buffer.concat(chunks);
      next();
    });
  } else {
    next();
  }
});

// ── Body parsers ──────────────────────────────────────────────────────────────
// Raised from Express's 100kb default to accommodate base64-encoded chart
// screenshots (Review My Trade) and admin screenshot scans — both send
// images as JSON data URLs rather than multipart, so the JSON body itself
// needs headroom for a compressed photo (client-side quality is capped at
// 0.7-0.85, so real uploads land well under this). Kept at 6mb rather than
// a larger figure specifically to limit how much memory an unauthenticated
// request can force this process to allocate before auth middleware (which
// runs after body parsing in Express) ever gets a chance to reject it —
// see docs/adr/0004-security-hardening.md.
app.use(express.json({ limit: "6mb" }));
app.use(express.urlencoded({ extended: true, limit: "6mb" }));

// ── Rate limiting ──────────────────────────────────────────────────────────────
// Applied after body parsing (parsing itself is cheap relative to a full
// request being handled) but before every /api route, so it can't be
// bypassed by hitting a route directly.
app.use("/api", apiRateLimit);

// ── Clerk middleware ───────────────────────────────────────────────────────────
// Resolves the publishable key from the request host so the same server can
// serve multiple Clerk custom domains. Falls back to CLERK_PUBLISHABLE_KEY
// when the host doesn't map to a custom domain.
if (clerkAuthEnabled) {
  app.use(
    clerkMiddleware((req) => ({
      publishableKey: publishableKeyFromHost(
        getClerkProxyHost(req) ?? "",
        clerkPublishableKey,
      ),
      secretKey: clerkSecretKey,
    }))
  );
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", router);

// ── Static web app (single-domain deployment) ────────────────────────────────
if (fs.existsSync(webDistDir)) {
  app.use(express.static(webDistDir));

  // Keep /api and /healthz owned by API handlers; serve SPA for everything else.
  app.get(/^(?!\/api(?:\/|$)|\/healthz$).*/, (_req, res) => {
    res.sendFile(path.join(webDistDir, "index.html"));
  });
}

// ── Health (root level) ───────────────────────────────────────────────────────
app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

export default app;
