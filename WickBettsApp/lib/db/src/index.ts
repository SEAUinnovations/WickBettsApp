import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Bounded pool with real timeouts. Without these, a lost/blocked Postgres
// connection (e.g. after a stale connection lingers from a previous deploy,
// or Postgres briefly hiccups) makes `pool.connect()` / queries hang FOREVER
// with no error, no log line, and no crash — the process stays technically
// "alive" (so Railway's restart policy never kicks in) while every request
// queues up indefinitely and Railway's edge eventually 502s the caller. That
// silent-hang failure mode is exactly what took the API down repeatedly.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 15_000,
  query_timeout: 15_000,
  keepAlive: true,
});

// node-postgres requires an 'error' listener on the pool. If an idle client
// emits an error (dropped connection, Postgres restart, network blip) and
// nothing is listening, Node throws it as an uncaught exception and kills
// the whole process. Log it instead so a transient DB hiccup can't take the
// entire API down.
pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("[db] Unexpected error on idle Postgres client", err);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
