# Wick Betts

A subscription trading-signals app: stock/crypto/options signals (manual +
automated), a member community, mentorship booking, and AI-assisted trade
review. Ships as a React Native (Expo) app — native iOS/Android plus a web
export — backed by an Express API on Railway with Postgres.

For the reasoning behind non-obvious architectural choices, see
[`docs/adr/`](./docs/adr/) rather than re-deriving it from the code.

## Monorepo layout

```
artifacts/
  api-server/       Express API (this is what deploys to Railway)
  wick-betts-mobile/ Expo app — native + web export (this is wickbetts.com)
  wick-betts/        Legacy web build output target (railway:build assembles into this)
lib/
  db/                Drizzle ORM schema + migrations — shared by api-server
  integrations/       Shared third-party integration helpers
scripts/             One-off/maintenance scripts (e.g. verify:stripe:prod-test)
docs/adr/            Architecture Decision Records
```

Package manager is **pnpm** (workspace root `pnpm-workspace.yaml`), Node
`>=22 <23`. The root `preinstall` script actively refuses non-pnpm installs.

## Local setup

```bash
pnpm install
cp artifacts/api-server/.env.example artifacts/api-server/.env
cp artifacts/wick-betts-mobile/.env.example artifacts/wick-betts-mobile/.env
# fill in the values below, then:
pnpm --filter @workspace/db push   # or see "Database migrations" below
pnpm --filter @workspace/api-server dev
```

For the mobile app: `pnpm --filter @workspace/wick-betts-mobile start`
(Expo CLI; scan the QR code or press `w` for the web build).

## Required environment variables (api-server)

See `artifacts/api-server/.env.example` for the full annotated list. The
short version:

| Variable | Required for |
|---|---|
| `DATABASE_URL` | Everything — Postgres connection |
| `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Auth |
| `APP_ORIGIN` | Stripe redirect URLs, CORS allowlist |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Billing |
| `STRIPE_PRICE_SIGNALS` / `_MENTORSHIP` / `_MEMBERSHIP` | Checkout (accepts either a Stripe Product ID `prod_...` or Price ID `price_...` — see `resolvePriceId` in `routes/stripe.ts`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `OPENAI_API_KEY` | Admin screenshot-to-signal scanning **and** Review My Trade (both use OpenAI vision — see `docs/adr/0003-trade-review-ai-provider.md`). Neither feature is configured in production as of this writing. |
| `RESEND_API_KEY` / `EMAIL_FROM` | Email alerts for new signals and major news (raw HTTP fetch, no SDK — see `utils/emailNotifications.ts`). Not configured in production as of this writing; without it, email sends are skipped and only push notifications go out. |

Nothing here needs an Anthropic/Claude key — an earlier build of Review My
Trade used Claude, but it was switched to OpenAI (see ADR 0003) before it
shipped.

## Database migrations

**Use `drizzle-kit generate`, not `drizzle-kit push`, for anything that
needs to reach production.** Full reasoning and a real incident writeup in
[`docs/adr/0001-drizzle-migrations-vs-push.md`](./docs/adr/0001-drizzle-migrations-vs-push.md) —
short version: a migration file that exists on disk but isn't listed in
`lib/db/drizzle/meta/_journal.json` never runs, silently, and that exact
gap took two tables and a set of columns missing from production for a
while before anyone noticed.

```bash
cd lib/db
DATABASE_URL=<your-db> pnpm exec drizzle-kit generate --config ./drizzle.config.ts
# review the generated SQL + journal diff, then commit it
```

The api-server runs pending migrations automatically at boot
(`artifacts/api-server/src/index.ts`, non-fatal on failure — it logs and
starts anyway so a migration hiccup doesn't take the whole app down, but
routes touching the missing schema will 500 until it's fixed). No manual
migration step is needed on deploy beyond committing the generated files.

`drizzle-kit push --force` is used in `.github/workflows/backend-test.yml`
to stand up a disposable schema for CI smoke tests — that's intentional
and fine there (fast, no history needed for a throwaway test DB); don't
copy that pattern into anything that touches a real database.

## Deploy

- **API (`artifacts/api-server`)**: Railway auto-deploys on push to `main`
  via Railway's own GitHub integration — no GitHub Actions workflow
  drives this. Build is a multi-stage `Dockerfile` at the repo root
  (`pnpm run railway:build` → `railway:start`). Healthcheck: `/healthz`.
- **Web (`wickbetts.com`)**: `.github/workflows/deploy-web.yml` builds the
  Expo web export and deploys it to a Cloudflare Worker on every push to
  `main`. This is separate from the API deploy — the Worker serves static
  assets and proxies `/api/*` through to the Railway API.
- **Mobile (iOS/Android)**: no CI pipeline yet. Built/submitted manually
  via EAS — see
  [`docs/app-store-submission-guide.md`](./docs/app-store-submission-guide.md)
  for the full walkthrough (`app.json`/`eas.json` config, account setup,
  build/submit commands, and the App Store payment-links compliance note).

## Security

See [`docs/adr/0004-security-hardening.md`](./docs/adr/0004-security-hardening.md)
for what's covered (rate limiting, security headers, CORS anchoring, body
size limits) and explicitly what isn't (no CSP, no edge-level DDoS
mitigation — the API domain isn't currently proxied through Cloudflare the
way the web frontend is).

## Testing

- `pnpm run typecheck` — project-wide TypeScript check.
- `.github/workflows/backend-test.yml` (`Backend Test` / job `test`) runs
  on every push to `main` and PR: builds the API, stands up a disposable
  Postgres schema via `drizzle-kit push --force`, and runs API smoke
  tests plus Stripe readiness checks against test-mode keys.
- No frontend test suite currently exists.
