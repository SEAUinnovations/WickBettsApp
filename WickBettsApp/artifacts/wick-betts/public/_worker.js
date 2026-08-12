const DEFAULT_RAILWAY_ORIGIN = 'https://wickbettsapp-production.up.railway.app';

function resolveRailwayOrigin(env) {
  const raw = typeof env?.RAILWAY_API_ORIGIN === 'string' ? env.RAILWAY_API_ORIGIN.trim() : '';
  return raw ? raw.replace(/\/$/, '') : DEFAULT_RAILWAY_ORIGIN;
}

function shouldProxy(pathname) {
  return pathname === '/healthz' || pathname.startsWith('/api/');
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

    if (shouldProxy(url.pathname)) {
      return proxyRequest(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
