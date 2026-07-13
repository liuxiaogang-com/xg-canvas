import type { Request } from 'express';

import { SESSION_COOKIE } from './session-cookie';

/** Pull the session token from cookie `xgcanvas_session` first, then a Bearer header. */
export function extractToken(req: Request): string | null {
  const cookie = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  if (cookie) return cookie;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

/** Stable per-device id the web client persists (cookie) for same-device reuse. */
export function extractDeviceId(req: Request): string | null {
  return (req.cookies as Record<string, string> | undefined)?.['xgcanvas_device'] ?? null;
}
