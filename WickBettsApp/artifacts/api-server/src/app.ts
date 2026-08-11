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

const app: Express = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDistDir = process.env.WEB_DIST_DIR
  ? path.resolve(process.env.WEB_DIST_DIR)
  : path.resolve(__dirname, "../../wick-betts/dist/public");

const allowedOriginPatterns: RegExp[] = [/localhost/];
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Clerk middleware ───────────────────────────────────────────────────────────
// Resolves the publishable key from the request host so the same server can
// serve multiple Clerk custom domains. Falls back to CLERK_PUBLISHABLE_KEY
// when the host doesn't map to a custom domain.
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  }))
);

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
