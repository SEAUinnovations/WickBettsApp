import { fileURLToPath } from "node:url";
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./lib/db.js";
import app from "./app.js";
import { logger } from "./lib/logger.js";

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
  process.exit(1);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
