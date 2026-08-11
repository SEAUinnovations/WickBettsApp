/**
 * Resolves the base URL for all API calls made from the mobile app.
 *
 * Resolution order (highest priority first):
 *  1. EXPO_PUBLIC_API_URL  — explicit full HTTPS URL, required for EAS/standalone builds.
 *                            Set in your EAS build profile or eas.json:
 *                              { "env": { "EXPO_PUBLIC_API_URL": "https://your-api.example.com" } }
 *  2. EXPO_PUBLIC_DOMAIN   — hostname-only (no scheme), injected by the Replit dev script.
 *                            Produces https://<hostname> for development.
 *  3. Relative origin      — only valid for web (browser); native always needs an absolute URL.
 *
 * For native builds, a missing API URL causes an immediately visible Error so
 * the misconfiguration surfaces at startup rather than as a silent auth failure.
 */

import { Platform } from 'react-native';

function resolveApiOrigin(): string {
  // Option 1: explicit full URL (takes priority — use for all EAS/release builds)
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) {
    // Strip trailing slash for consistent construction: origin + /api/...
    return explicit.replace(/\/$/, '');
  }

  // Option 2: hostname-only (Replit dev script injects REPLIT_DEV_DOMAIN here)
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) {
    return `https://${domain}`;
  }

  // Option 3: native with no origin configured — fail immediately
  if (Platform.OS !== 'web') {
    throw new Error(
      '[wick-betts] Missing API URL configuration for native build.\n' +
      'Set EXPO_PUBLIC_API_URL to the full HTTPS URL of your API server.\n' +
      'Example: EXPO_PUBLIC_API_URL=https://app.example.com\n' +
      'For EAS builds, add it to the "env" block of your eas.json build profile.'
    );
  }

  // Option 4: web — relative origin (browser resolves against its own host)
  return '';
}

const API_ORIGIN = resolveApiOrigin();

/** Full API base URL including /api suffix, e.g. https://app.example.com/api */
export const API_BASE = `${API_ORIGIN}/api`;

/** Origin only (no /api suffix), used for constructing OAuth initiation URLs */
export const AUTH_DOMAIN = API_ORIGIN;
