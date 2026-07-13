import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { browserCookieOptions } from './cookie-policy';

const COOKIE = 'xgcanvas_oauth';

/** Where a provider redirects back to (proxied to the API in dev). */
export function oauthCallbackUri(config: ConfigService, key: string): string {
  const base = config.get<string>('PUBLIC_BASE_URL', 'http://localhost:5180');
  return `${base}/api/v1/auth/oauth/${key}/callback`;
}

export interface OAuthState {
  state: string;
  key: string;
  mode: 'login' | 'bind';
  userId?: string;
}

export function setOAuthState(req: Request, res: Response, st: OAuthState): void {
  res.cookie(COOKIE, JSON.stringify(st), {
    ...browserCookieOptions(req),
    maxAge: 10 * 60 * 1000,
  });
}

export function readOAuthState(req: Request): OAuthState | null {
  const c = (req.cookies as Record<string, string> | undefined)?.[COOKIE];
  if (!c) return null;
  try {
    return JSON.parse(c) as OAuthState;
  } catch {
    return null;
  }
}

export function clearOAuthState(req: Request, res: Response): void {
  res.clearCookie(COOKIE, browserCookieOptions(req));
}
