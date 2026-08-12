const DEFAULT_RAILWAY_ORIGIN = 'https://wickbettsapp-production.up.railway.app';

type EnvWithOrigin = {
  RAILWAY_API_ORIGIN?: string;
};

function resolveOrigin(env: EnvWithOrigin): string {
  const raw = env.RAILWAY_API_ORIGIN?.trim();
  if (!raw) return DEFAULT_RAILWAY_ORIGIN;
  return raw.replace(/\/$/, '');
}

export async function proxyToRailway(request: Request, env: EnvWithOrigin): Promise<Response> {
  const incomingUrl = new URL(request.url);
  const targetOrigin = resolveOrigin(env);
  const targetUrl = `${targetOrigin}${incomingUrl.pathname}${incomingUrl.search}`;

  const headers = new Headers(request.headers);
  headers.set('x-forwarded-host', incomingUrl.host);
  headers.set('x-forwarded-proto', incomingUrl.protocol.replace(':', ''));
  headers.delete('host');

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  });

  const responseHeaders = new Headers(upstream.headers);
  if (incomingUrl.pathname.startsWith('/api/')) {
    responseHeaders.set('cache-control', 'no-store');
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
