const rawApiOrigin = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.trim();

const apiOrigin = rawApiOrigin ? rawApiOrigin.replace(/\/$/, '') : '';

export const API_BASE = `${apiOrigin}/api`;

export function apiPath(pathname: string): string {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${API_BASE}${normalized}`;
}
