# Wick Betts Local Bring-Up

This repo is a pnpm workspace with three runtime targets:

- API: `artifacts/api-server`
- Web app (Vite): `artifacts/wick-betts`
- Mobile app (Expo): `artifacts/wick-betts-mobile`

## 1. Install dependencies

```bash
pnpm install
```

## 2. Create env files

Create these files from templates:

- `artifacts/api-server/.env`
- `artifacts/wick-betts/.env`
- `artifacts/wick-betts-mobile/.env`

Then fill values from your Clerk app, DB, and Stripe account.

If you have not started Railway yet, use a local Postgres `DATABASE_URL` first.
You can swap to Railway later without changing app code.

## 3. Start the API server

```bash
cd artifacts/api-server
set -a && source .env && set +a
pnpm dev
```

Notes:
- `PORT` must be set (default template uses `8080`).
- Startup runs DB migrations from `lib/db/drizzle` automatically.

## 4. Start the web app

```bash
cd artifacts/wick-betts
set -a && source .env && set +a
pnpm dev
```

Notes:
- `PORT` and `BASE_PATH` are required by `vite.config.ts`.
- In local dev, web `/api` requests proxy to `http://localhost:8080`.
- `VITE_API_ORIGIN` is optional; leave empty for same-origin `/api`.

## 5. Start the mobile app

```bash
cd artifacts/wick-betts-mobile
set -a && source .env && set +a
pnpm exec expo start --localhost --port ${PORT:-8081}
```

Notes:
- Use `EXPO_PUBLIC_API_URL` for native app connectivity (example: `http://localhost:8080`).
- For production, set `EXPO_PUBLIC_API_URL` to your Cloudflare domain.

## 6. Smoke checks

Health:

```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/api/health
```

Auth sanity (expects 401 without token):

```bash
curl -i http://localhost:8080/api/auth/me
```

## 7. No Railway Yet (recommended starting point)

- Keep API `DATABASE_URL` pointed at local Postgres.
- Keep API `APP_ORIGIN=http://localhost:3000` during local development.
- Keep mobile `EXPO_PUBLIC_API_URL=http://localhost:8080` for simulator/device access on the same machine.

## 8. Railway/Cloudflare migration when ready

- Create one Railway project and one service for the API.
- Provision Railway Postgres and copy its connection string into API `DATABASE_URL`.
- Set API `APP_ORIGIN` to your Cloudflare app domain.
- Set API `CORS_ALLOWED_ORIGINS` to your web app origin(s).
- Set `CORS_ALLOW_REPLIT_ORIGINS=false` unless you still need legacy Replit traffic.
- Update mobile `EXPO_PUBLIC_API_URL` to your Cloudflare domain.

## 9. Railway/Cloudflare parity hints

- Set API `APP_ORIGIN` to your canonical app URL (for Stripe success/cancel/portal returns).
- Set API `CORS_ALLOWED_ORIGINS` to include your production origin(s).
- Keep `CORS_ALLOW_REPLIT_ORIGINS=false` in production unless legacy Replit endpoints are still required.
