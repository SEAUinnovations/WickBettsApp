Cloudflare DNS template

1. Record type: CNAME
2. Name: app
3. Target: <your-railway-public-hostname>
4. Proxy status: Proxied
5. TTL: Auto

Cloudflare SSL/TLS

1. Mode: Full (strict preferred after cert trust is confirmed)
2. Always Use HTTPS: On

Cloudflare Cache Rule

1. If URI Path starts with /api/
2. Cache eligibility: Bypass

Post-change checks

1. https://app.yourdomain.com/healthz returns 200
2. https://app.yourdomain.com/api/healthz returns 200
3. https://app.yourdomain.com loads web app
