import { toast } from '../../ui';

/**
 * Background canvas saves (debounced node updates, undo/redo reconcile) used to
 * `.catch(() => undefined)` — so a failed PATCH left the client showing "saved"
 * while the server had nothing, and a refresh silently lost the edit. Route those
 * failures here: always log, and surface a throttled toast so the user knows to
 * refresh (throttled because one drag can spawn many failing saves).
 */
let lastToastAt = 0;

export function notifySyncError(err: unknown, context: string): void {
  // eslint-disable-next-line no-console
  console.error(`[canvas-sync] ${context} failed`, err);
  const now = Date.now();
  if (now - lastToastAt > 4000) {
    lastToastAt = now;
    toast.error('部分修改未能同步到服务器,请刷新页面确认');
  }
}
