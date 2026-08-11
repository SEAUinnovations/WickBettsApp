/**
 * Clerk Frontend API Proxy Middleware
 *
 * Proxies Clerk Frontend API requests through your domain, enabling Clerk
 * authentication on custom domains and .replit.app deployments without
 * requiring CNAME DNS configuration.
 *
 * AUTH CONFIGURATION: To manage users, enable/disable login providers
 * (Google, GitHub, etc.), change app branding, or configure OAuth credentials,
 * use the Auth pane in the workspace toolbar. There is no external Clerk
 * dashboard — all auth configuration is done through the Auth pane.
 *
 * IMPORTANT:
 * - Only active in production (Clerk proxying doesn't work for dev instances)
 * - Must be mounted BEFORE express.json() middleware
 *
 * Usage in app.ts:
 *   import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
 *   app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
 */

import type { IncomingHttpHeaders } from 'http';
import type { Request, RequestHandler, Response } from 'express';

const CLERK_FAPI = 'https://frontend-api.clerk.dev';
export const CLERK_PROXY_PATH = '/api/__clerk';

function rewriteProxyPath(originalPath: string): string {
  const rewritten = originalPath.replace(new RegExp(`^${CLERK_PROXY_PATH}`), '');
  return rewritten.startsWith('/') ? rewritten : `/${rewritten}`;
}

function copyResponseHeaders(upstream: globalThis.Response, res: Response): void {
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'transfer-encoding' || lower === 'connection' || lower === 'keep-alive') {
      return;
    }
    res.setHeader(key, value);
  });
}

async function forwardToClerk(req: Request, res: Response, secretKey: string): Promise<void> {
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = getClerkProxyHost(req) || '';
  const proxyUrl = `${protocol}://${host}${CLERK_PROXY_PATH}`;

  const xff = req.headers['x-forwarded-for'];
  const clientIp =
    (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    '';

  const rewrittenPath = rewriteProxyPath(req.path);
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const targetUrl = `${CLERK_FAPI}${rewrittenPath}${query}`;

  const headers = new Headers();
  Object.entries(req.headers).forEach(([key, value]) => {
    if (!value) return;
    const lower = key.toLowerCase();
    if (lower === 'host' || lower === 'content-length' || lower === 'connection') return;
    if (Array.isArray(value)) {
      headers.set(key, value.join(','));
    } else {
      headers.set(key, value);
    }
  });

  headers.set('Clerk-Proxy-Url', proxyUrl);
  headers.set('Clerk-Secret-Key', secretKey);
  if (clientIp) {
    headers.set('X-Forwarded-For', clientIp);
  }

  const needsBody = req.method !== 'GET' && req.method !== 'HEAD';
  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: needsBody ? (req as unknown as BodyInit) : undefined,
    // Required by Node when sending a stream request body.
    ...(needsBody ? ({ duplex: 'half' } as const) : {}),
  });

  copyResponseHeaders(upstream, res);
  res.status(upstream.status);

  const body = Buffer.from(await upstream.arrayBuffer());
  res.setHeader('content-length', String(body.length));
  res.end(body);
}

/**
 * Returns the first effective public hostname for the given request,
 * preferring x-forwarded-host over the Host header so callers behind a
 * proxy see the original client-facing host.
 *
 * x-forwarded-host can take three shapes:
 *   - undefined (no proxy involved)
 *   - a single string (one proxy hop)
 *   - a comma-delimited string when an upstream appended rather than
 *     replaced the header (Node folds duplicate headers this way), or a
 *     string[] in some Express typings
 * In the multi-value case, the leftmost value is the original client-
 * facing host. Take that one in all forms. Exported so that app.ts
 * (clerkMiddleware callback) and this proxy middleware agree on which
 * hostname is canonical — otherwise multi-domain/custom-domain flows
 * break.
 */
export function getClerkProxyHost(req: {
  headers: IncomingHttpHeaders;
}): string | undefined {
  const forwarded = req.headers['x-forwarded-host'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const firstHop = raw?.split(',')[0]?.trim();
  return firstHop || req.headers.host?.trim() || undefined;
}

export function clerkProxyMiddleware(): RequestHandler {
  // Only run proxy in production — Clerk proxying doesn't work for dev instances
  if (process.env.NODE_ENV !== 'production') {
    return (_req, _res, next) => next();
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return (_req, _res, next) => next();
  }

  return (req, res, next) => {
    void forwardToClerk(req, res, secretKey).catch((error) => {
      if (!res.headersSent) {
        res.status(502).json({ error: 'Failed to proxy Clerk request' });
      }
      next(error);
    });
  };
}
