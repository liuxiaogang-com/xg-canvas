import { assetApi, type AssetRecord } from '../api/asset';
import { ApiError } from '../api/client';
import { videoFrameThumb } from './video-thumbnail';

type EnsureState =
  | { status: 'succeeded' }
  | { status: 'failed'; attempts: number; retryAt: number };

const MAX_CONCURRENT_ENSURES = 2;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 5 * 60_000;
const AUTH_RETRY_MS = 15 * 60_000;
const THUMB_PUT_TIMEOUT_MS = 15_000;

const states = new Map<string, EnsureState>();
const inflight = new Map<string, Promise<AssetRecord | null>>();
const permitWaiters: Array<() => void> = [];
let activeEnsures = 0;

/**
 * Attach a poster to a video after an explicit user action. The write intent is
 * requested before minting/reading the full video URL, so read-only viewers do
 * not pay the decode cost only to fail at the final write step.
 */
export async function ensureVideoThumb(assetId: string): Promise<AssetRecord | null> {
  if (!assetId) return null;
  const state = states.get(assetId);
  if (state?.status === 'succeeded') return null;
  if (state?.status === 'failed' && state.retryAt > Date.now()) return null;

  const existing = inflight.get(assetId);
  if (existing) return existing;

  const run = withEnsurePermit(async (): Promise<AssetRecord | null> => {
    try {
      const detail = await assetApi.detail(assetId);
      if (detail.type !== 'video' || detail.thumb_storage_key) {
        states.set(assetId, { status: 'succeeded' });
        return detail;
      }

      // Authorization gate first. A 403 stops here, before a full video URL is
      // signed or a media element begins range reads/decoding.
      const intent = await assetApi.thumbnailIntent(assetId);
      const { url } = await assetApi.url(assetId, 3600, 'full');
      const blob = await videoFrameThumb(url);
      if (!blob) throw new Error('failed to extract video frame');

      const put = await putThumbnail(intent.thumb_upload_url, blob);
      if (!put.ok) throw new Error(`thumb upload failed: HTTP ${put.status}`);

      const updated = await assetApi.thumbnailComplete(assetId);
      states.set(assetId, { status: 'succeeded' });
      return updated;
    } catch (error) {
      rememberFailure(assetId, error);
      return null;
    }
  }).finally(() => {
    inflight.delete(assetId);
  });

  inflight.set(assetId, run);
  return run;
}

/** Clear a failure backoff after an explicit retry or known permission change. */
export function resetEnsureVideoThumb(assetId: string): void {
  if (states.get(assetId)?.status === 'failed') states.delete(assetId);
}

async function withEnsurePermit<T>(job: () => Promise<T>): Promise<T> {
  await acquireEnsurePermit();
  try {
    return await job();
  } finally {
    releaseEnsurePermit();
  }
}

function acquireEnsurePermit(): Promise<void> {
  if (activeEnsures < MAX_CONCURRENT_ENSURES) {
    activeEnsures += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => permitWaiters.push(resolve));
}

function releaseEnsurePermit(): void {
  const next = permitWaiters.shift();
  if (next) {
    // Transfer the held permit directly to the queued job.
    next();
    return;
  }
  activeEnsures -= 1;
}

function rememberFailure(assetId: string, error: unknown): void {
  const previous = states.get(assetId);
  const attempts = previous?.status === 'failed' ? previous.attempts + 1 : 1;
  const authFailure = error instanceof ApiError && (error.status === 401 || error.status === 403);
  const retryDelay = authFailure
    ? AUTH_RETRY_MS
    : Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(attempts - 1, 4));
  states.set(assetId, { status: 'failed', attempts, retryAt: Date.now() + retryDelay });
}

async function putThumbnail(url: string, blob: Blob): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), THUMB_PUT_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: 'PUT',
      body: blob,
      headers: { 'content-type': 'image/jpeg' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
