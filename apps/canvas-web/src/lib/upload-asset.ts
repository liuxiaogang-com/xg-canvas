import { assetApi, type AssetRecord } from '../api/asset';
import { drawToJpeg, MEDIA_DECODE_TIMEOUT_MS, videoFrameThumb } from './video-thumbnail';

const THUMB_UPLOAD_TIMEOUT_MS = 15_000;

export interface UploadOptions {
  project_id?: string;
  visibility?: AssetRecord['visibility'];
  onProgress?(fraction: number): void;
  signal?: AbortSignal;
}

/**
 * Full presigned direct-upload flow: intent -> PUT bytes (+ client-generated
 * thumbnail for image/video) -> complete. Returns the persisted asset row.
 */
export async function uploadAsset(file: File, opts: UploadOptions = {}): Promise<AssetRecord> {
  const type = assetTypeOf(file.type);
  const media = await probeMedia(file, type, opts.signal);
  const thumb = await makeThumbnail(file, type, opts.signal);
  assertNotAborted(opts.signal);

  const intent = await assetApi.uploadIntent({
    type,
    mime_type: file.type || 'application/octet-stream',
    bytes: file.size,
    name: file.name,
    project_id: opts.project_id,
    visibility: opts.visibility,
    with_thumbnail: !!thumb,
  });

  await putWithProgress(intent.upload_url, file, opts.onProgress, opts.signal);
  let thumbnailUploaded = false;
  if (thumb && intent.thumb_upload_url) {
    try {
      thumbnailUploaded = await putThumbnailBestEffort(intent.thumb_upload_url, thumb, opts.signal);
    } catch (error) {
      // A derived thumbnail is best-effort. An explicit cancellation still
      // aborts the flow; storage/CORS failures fall back to the source object.
      if (opts.signal?.aborted) throw error;
    }
  }

  return assetApi.completeUpload(intent.draft_id, {
    width: media.width,
    height: media.height,
    duration_ms: media.duration_ms,
    has_thumbnail: thumbnailUploaded,
  });
}

export function assetTypeOf(mime: string): AssetRecord['type'] {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/json') return 'json';
  return 'text';
}

function putWithProgress(
  url: string,
  file: File,
  onProgress?: (f: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  // XHR instead of fetch purely for upload progress events.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const done = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => xhr.abort();

    if (signal?.aborted) {
      done(abortError());
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    xhr.open('PUT', url);
    if (file.type) xhr.setRequestHeader('content-type', file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? done()
        : done(new Error(`upload failed: HTTP ${xhr.status}`));
    xhr.onerror = () => done(new Error('upload failed: network error'));
    xhr.onabort = () => done(abortError());
    xhr.send(file);
  });
}

async function probeMedia(
  file: File,
  type: AssetRecord['type'],
  signal?: AbortSignal,
): Promise<{ width?: number; height?: number; duration_ms?: number }> {
  try {
    assertNotAborted(signal);
    if (type === 'image') {
      const bmp = await createImageBitmap(file);
      const out = { width: bmp.width, height: bmp.height };
      bmp.close();
      assertNotAborted(signal);
      return out;
    }
    if (type === 'video' || type === 'audio') {
      const out = await probeAv(file, type, signal);
      assertNotAborted(signal);
      return out;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    /* metadata is best-effort */
  }
  return {};
}

function probeAv(
  file: File,
  type: 'video' | 'audio',
  signal?: AbortSignal,
): Promise<{ width?: number; height?: number; duration_ms?: number }> {
  return new Promise((resolve) => {
    const el = document.createElement(type);
    const url = URL.createObjectURL(file);
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      el.onloadedmetadata = null;
      el.onerror = null;
      el.pause();
      el.removeAttribute('src');
      el.load();
      URL.revokeObjectURL(url);
    };
    const done = (v: { width?: number; height?: number; duration_ms?: number }) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(v);
    };
    const onAbort = () => done({});

    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      const duration_ms = Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : undefined;
      if (type === 'video') {
        const v = el as HTMLVideoElement;
        done({ width: v.videoWidth || undefined, height: v.videoHeight || undefined, duration_ms });
      } else {
        done({ duration_ms });
      }
    };
    el.onerror = () => done({});
    if (signal?.aborted) {
      done({});
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => done({}), MEDIA_DECODE_TIMEOUT_MS);
    el.src = url;
  });
}

/** JPEG thumbnail for images and videos (first frame); null for other types. */
async function makeThumbnail(
  file: File,
  type: AssetRecord['type'],
  signal?: AbortSignal,
): Promise<Blob | null> {
  try {
    assertNotAborted(signal);
    if (type === 'image') {
      const bmp = await createImageBitmap(file);
      const blob = await drawToJpeg(bmp, bmp.width, bmp.height);
      bmp.close();
      assertNotAborted(signal);
      return blob;
    }
    if (type === 'video') {
      const blob = await videoFrameThumb(file, { signal });
      assertNotAborted(signal);
      return blob;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    /* thumbnails are best-effort */
  }
  return null;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function abortError(): Error {
  return new DOMException('Operation aborted', 'AbortError');
}

async function putThumbnailBestEffort(url: string, blob: Blob, signal?: AbortSignal): Promise<boolean> {
  assertNotAborted(signal);
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), THUMB_UPLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'PUT',
      body: blob,
      headers: { 'content-type': 'image/jpeg' },
      signal: controller.signal,
    });
    return response.ok;
  } catch (error) {
    if (signal?.aborted) throw error;
    return false;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
