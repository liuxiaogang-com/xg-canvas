import type { Request, Response } from 'express';

import { sessionTtlMs } from '../session/session-lifetime';
import { browserCookieOptions } from './cookie-policy';

/** The single session cookie name, shared by the controller and the guard. */
export const SESSION_COOKIE = 'xgcanvas_session';

export function setSessionCookie(req: Request, res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    ...browserCookieOptions(req),
    maxAge: sessionTtlMs(process.env.SESSION_TTL_DAYS),
  });
}

export function clearSessionCookie(req: Request, res: Response): void {
  res.clearCookie(SESSION_COOKIE, browserCookieOptions(req));
}
