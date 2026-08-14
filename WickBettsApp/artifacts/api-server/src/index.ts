import { fileURLToPath } from "node:url";
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./lib/db.js";
import app from "./app.js";
import { logger } from "./lib/logger.js";

// Safety net: without these, an unhandled rejection or a thrown error outside
// an Express request handler either crashes the process with zero log output
// (uncaughtException) or gets silently swallowed forever (unhandledRejection),
// which is indistinguishable from the server just hanging. Log loudly so any
// future incident leaves a trace, then exit so Railway's restartPolicy
// (ON_FAILURE, up to 10 retries) can actually bring it back up.
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — exiting so Railway can restart the service");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection — exiting so Railway can restart the service");
  process.exit(1);
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Resolve migrations folder relative to this compiled file so the path works
// in both development (dist/index.mjs) and production deployments.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(__dirname, "migrations");

// Run pending Drizzle migrations before accepting any traffic.
// The genesis migration (0000) is fully idempotent — all CREATE TYPE / CREATE TABLE
// statements use IF NOT EXISTS / DO ... EXCEPTION blocks, so it runs safely against
// databases that were provisioned with `drizzle-kit push` before migration files existed.
try {
  await migrate(db, { migrationsFolder });
  logger.info("Database migrations applied");
} catch (err) {
  logger.error({ err }, "Failed to run database migrations");
  logger.warn("Continuing startup without applying migrations; some database-backed routes may be degraded");
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// Railway sends SIGTERM on every redeploy/stop. Without handling it, the
// process is killed while still holding open Postgres connections, which
// leak on the database side until Postgres's own keepalive eventually times
// them out — and with enough redeploys in a short window, that can push a
// shared/managed Postgres instance toward its connection limit, causing the
// *next* deploy's pool.connect() calls to hang waiting for a free slot.
// Closing cleanly here avoids piling that up.
function shutdown(signal: string) {
  logger.info({ signal }, "Received shutdown signal, closing server and DB pool");
  server.close(() => {
    pool
      .end()
      .catch((err) => logger.warn({ err }, "Error closing DB pool"))
      .finally(() => process.exit(0));
  });
  // Force-exit if graceful shutdown hangs for any reason.
  setTimeout(() => process.exit(1), 8_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
