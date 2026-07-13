import type { Request } from 'express';

import type { LoginContext } from './auth.service';

/** Build the device/provenance context every login path stamps onto its session. */
export function buildLoginContext(req: Request): LoginContext {
  const ua = (req.headers['user-agent'] as string | undefined) ?? null;
  return {
    userAgent: ua,
    ip: cleanIp(req.ip),
    clientDeviceId: (req.cookies as Record<string, string> | undefined)?.['xgcanvas_device'] ?? null,
    deviceLabel: labelFromUserAgent(ua),
    platform: null,
  };
}

/**
 * Tidy the client IP for storage/display. With `trust proxy` set, `req.ip`
 * already reflects X-Forwarded-For; here we strip the IPv4-mapped-IPv6 prefix
 * and render loopback as 127.0.0.1 instead of `::1`.
 */
export function cleanIp(ip: string | undefined | null): string | null {
  if (!ip) return null;
  let v = ip;
  if (v.startsWith('::ffff:')) v = v.slice(7); // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
  if (v === '::1') v = '127.0.0.1';
  return v;
}

/** Coarse, best-effort device label for the session list (e.g. "Chrome / macOS"). */
export function labelFromUserAgent(ua: string | null): string | null {
  if (!ua) return null;
  const browser = /MicroMessenger/.test(ua)
    ? '微信'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Macintosh|Mac OS X/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(' / ') : null;
}
