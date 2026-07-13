import type { CookieOptions, Request } from 'express';

/**
 * Whether the browser reached XG Canvas over HTTPS.
 *
 * canvas-web proxies `/api` to canvas-api and overwrites X-Forwarded-Proto
 * with its public scheme. Reading it here keeps zero-config LAN HTTP usable
 * while still issuing Secure cookies behind an HTTPS reverse proxy.
 */
export function requestUsesHttps(req: Request): boolean {
  if (req.secure) return true;
  const forwarded = req.get('x-forwarded-proto');
  return forwarded?.split(',')[0]?.trim().toLowerCase() === 'https';
}

export function browserCookieOptions(req: Request): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: requestUsesHttps(req),
    path: '/',
  };
}
