import { createClientId } from '../lib/id';

/** A stable per-browser id sent as the `xgcanvas_device` cookie so the server can
 *  treat re-logins from this browser as the same device (not a new slot). It is
 *  a plain device tag, not a credential. */
export function ensureDeviceId(): void {
  if (typeof document === 'undefined') return;
  if (document.cookie.split('; ').some((c) => c.startsWith('xgcanvas_device='))) return;
  const id = createClientId();
  document.cookie = `xgcanvas_device=${id}; path=/; max-age=${365 * 24 * 3600}; samesite=lax`;
}
