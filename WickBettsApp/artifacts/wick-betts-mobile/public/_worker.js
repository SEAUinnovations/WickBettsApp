const DEFAULT_RAILWAY_ORIGIN = 'https://wickbettsapp-production.up.railway.app';
// Forward Clerk FAPI calls to the custom domain — Cloudflare routes clerk.wickbetts.com
// to Clerk's servers via the Proxied CNAME record.
const CLERK_FAPI_ORIGIN = 'https://clerk.wickbetts.com';
const CLERK_PROXY_PREFIX = '/api/__clerk';

function resolveRailwayOrigin(env) {
  const raw = typeof env?.RAILWAY_API_ORIGIN === 'string' ? env.RAILWAY_API_ORIGIN.trim() : '';
  return raw ? raw.replace(/\/$/, '') : DEFAULT_RAILWAY_ORIGIN;
}

function isClerkProxy(pathname) {
  return pathname === CLERK_PROXY_PREFIX || pathname.startsWith(CLERK_PROXY_PREFIX + '/');
}

function shouldProxy(pathname) {
  return pathname === '/healthz' || pathname.startsWith('/api/');
}

async function proxyToClerk(request, env) {
  const url = new URL(request.url);
  const clerkPath = url.pathname.slice(CLERK_PROXY_PREFIX.length) || '/';
  const targetUrl = `${CLERK_FAPI_ORIGIN}${clerkPath}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete('host');
  // Tell Clerk this is a proxied request so it generates correct redirect URLs
  headers.set('Clerk-Proxy-Url', `${url.origin}${CLERK_PROXY_PREFIX}`);
  const secretKey = typeof env?.CLERK_SECRET_KEY === 'string' ? env.CLERK_SECRET_KEY.trim() : '';
  if (secretKey) {
    headers.set('Clerk-Secret-Key', secretKey);
  }
  headers.set('x-forwarded-proto', 'https');

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  });

  const responseHeaders = new Headers(upstream.headers);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

async function proxyRequest(request, env) {
  const url = new URL(request.url);
  const origin = resolveRailwayOrigin(env);
  const target = `${origin}${url.pathname}${url.search}`;

  const headers = new Headers(request.headers);
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''));
  headers.delete('host');

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  });

  const responseHeaders = new Headers(upstream.headers);
  if (url.pathname.startsWith('/api/')) {
    responseHeaders.set('cache-control', 'no-store');
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Clerk FAPI proxy — goes directly to Clerk, bypasses Railway
    if (isClerkProxy(url.pathname)) {
      return proxyToClerk(request, env);
    }
    // All other API + healthz — proxied to Railway
    if (shouldProxy(url.pathname)) {
      return proxyRequest(request, env);
    }
    // Serve SPA assets with index.html fallback for client-side routing
    try {
      const res = await env.ASSETS.fetch(request);
      if (res.status === 404) {
        return env.ASSETS.fetch(new Request(url.origin + '/'));
      }
      return res;
    } catch (_) {
      return env.ASSETS.fetch(new Request(url.origin + '/'));
    }
  },
};
