import { canvasApi } from '../../api/canvas';
import { notifySyncError } from './sync-error';

interface Pending {
  timer: ReturnType<typeof setTimeout>;
  run: () => Promise<unknown>;
}

const PENDING = new Map<string, Pending>();

function schedule(key: string, run: () => Promise<unknown>, delayMs: number): void {
  const prev = PENDING.get(key);
  if (prev) clearTimeout(prev.timer);
  const timer = setTimeout(() => {
    PENDING.delete(key);
    run().catch((e) => notifySyncError(e, key));
  }, delayMs);
  PENDING.set(key, { timer, run });
}

/** Debounced node update — coalesces drag/edit/resize storms into one PATCH. */
export function scheduleNodeUpdate(
  projectId: string,
  nodeId: string,
  patch: { position?: { x: number; y: number }; data?: Record<string, unknown> },
  delayMs = 350,
): void {
  schedule(`node:${nodeId}`, () => canvasApi.updateNode(projectId, nodeId, patch), delayMs);
}

export function scheduleViewport(
  projectId: string,
  viewport: { x: number; y: number; zoom: number },
  delayMs = 750,
): void {
  schedule('viewport', () => canvasApi.updateViewport(projectId, viewport), delayMs);
}

/** Fire every pending update NOW (e.g. on page-leave) instead of waiting out the debounce. */
export function flushAll(): void {
  const runs = [...PENDING.values()];
  PENDING.clear();
  for (const p of runs) {
    clearTimeout(p.timer);
    p.run().catch((e) => notifySyncError(e, 'flush'));
  }
}
