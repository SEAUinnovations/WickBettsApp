# 0001: Generated migration files + boot-time migrate(), not `drizzle-kit push`

## Status

Accepted (retroactively documenting an existing but broken setup, fixed 2026-08-14).

## Context

This repo already had the right architecture: `drizzle-kit generate` produces
versioned SQL files in `lib/db/drizzle/`, `artifacts/api-server/build.mjs`
copies that folder into the built `dist/migrations/`, and
`artifacts/api-server/src/index.ts` runs `drizzle-orm`'s `migrate()` against
`dist/migrations/` before the server starts accepting traffic.

In practice it wasn't working. On 2026-08-14, production's `/api/signals`
and `/api/watchlist` endpoints started 500ing after a deploy. Investigation
found:

- `lib/db/drizzle/0004_watchlists.sql` and `0005_news_overrides.sql` existed
  on disk with correct, idempotent SQL.
- `lib/db/drizzle/meta/_journal.json` — the manifest `migrate()` actually
  reads to know which files to run — only listed migrations 0-3. It was
  never updated when 0004/0005 were added.
- Because `migrate()` only ever sees migrations present in the journal, it
  silently never ran those two files. The `watchlists` and `news_overrides`
  tables were never created in production. A later change (`signals`
  gaining `source`/`news_alert`/`news_alert_note` columns) hit the same gap
  — the columns were added to `schema.ts` directly without generating a
  migration at all.

The failure mode is dangerous specifically because it's silent: the app
boots fine, `migrate()`'s catch block logs a warning and lets the server
start anyway (by design — see the comment in `index.ts`), so there's no
crash, no obvious signal. The only symptom is the affected routes 500ing
whenever they touch the missing column/table.

## Decision

Keep `drizzle-kit generate` + boot-time `migrate()` as the migration
strategy (not `drizzle-kit push`, which is diff-based and meant for local
iteration, not CI/CD). Fix the immediate journal gap by hand-adding the
missing entries and a new `0006_signals_auto_source.sql` /
`0007_trade_reviews.sql` / `0008_trade_review_credits.sql`, all written
idempotently (`IF NOT EXISTS` / `CREATE TYPE ... EXCEPTION WHEN
duplicate_object`) so re-running them against a database that already has
the columns (as production did, from a manual hotfix applied before this
was diagnosed) is a safe no-op.

Going forward: **every schema change must go through `drizzle-kit
generate`**, run from `lib/db/` with `DATABASE_URL` pointed at a real
Postgres instance, never a hand-edit of `schema.ts` alone. That command is
what keeps `_journal.json` and the `meta/*_snapshot.json` files consistent
with the migration files on disk — hand-editing `schema.ts` without it is
exactly how this gap was introduced.

## Consequences

- Fresh environments (a new developer's local DB, a staging environment)
  now provision correctly from `migrate()` alone.
- The genesis migration and everything after it is written to be safely
  re-runnable, so a future gap like this one degrades to "ran a redundant
  no-op" rather than "crashed the migrator" or "silently skipped."
- `0006`-`0011` were all hand-written (SQL + journal entry) without running
  `drizzle-kit generate`, because no execution environment was available to
  run it across any of these sessions. They do NOT have companion
  `meta/000X_snapshot.json` files. This means the next real
  `drizzle-kit generate` run will diff against the stale `0003` snapshot
  and may propose re-adding columns/tables that already exist (harmless
  since they're `IF NOT EXISTS`, but will produce a redundant migration
  file). Whoever next runs `drizzle-kit generate` should sanity-check its
  output against this ADR before committing it.
- CI's `backend-test.yml` workflow uses `drizzle-kit push --force` against
  a disposable test database spun up in the runner — that's fine and
  intentional for tests (it needs a from-scratch schema fast, doesn't need
  history), but it is not a substitute for the generate+migrate path and
  should not be copied into any production deploy step.
