Cloudflare DNS template (Pages frontend + Railway API)

1. Apex domain `wickbetts.com` must be attached to Cloudflare Pages project.
2. Optional `www` record should redirect to apex.
3. Do not point apex directly to Railway when Pages is the frontend host.

Cloudflare SSL/TLS

1. Mode: Full (strict preferred after cert trust is confirmed)
2. Always Use HTTPS: On

Cloudflare Functions / Rules

1. Deploy Pages Functions from `artifacts/wick-betts/functions`.
2. Set Pages variable `RAILWAY_API_ORIGIN=https://wickbettsapp-production.up.railway.app` (or your Railway host).
3. Optional Cache Rule for API traffic:
	- If URI Path starts with /api/
	- Cache eligibility: Bypass

Post-change checks

1. https://wickbetts.com/healthz returns 200
2. https://wickbetts.com/api/healthz returns 200
3. https://wickbetts.com loads web app
