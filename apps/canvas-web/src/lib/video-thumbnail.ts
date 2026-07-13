/** Longest edge for client-generated JPEG posters (upload + ensure). */
export const THUMB_MAX_EDGE = 512;

export const MEDIA_DECODE_TIMEOUT_MS = 12_000;
const CANVAS_ENCODE_TIMEOUT_MS = 5_000;

interface VideoFrameThumbOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Seek ~0.1s and draw a JPEG frame from a local File or remote video URL. */
export async function videoFrameThumb(
  source: File | string,
  options: VideoFrameThumbOptions = {},
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const objectUrl = typeof source === 'string' ? null : URL.createObjectURL(source);
    const src = typeof source === 'string' ? source : objectUrl!;
    const timeoutMs = options.timeoutMs ?? MEDIA_DECODE_TIMEOUT_MS;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    const done = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(blob);
    };
    const onAbort = () => done(null);
    const draw = () => {
      void drawToJpeg(video, video.videoWidth, video.videoHeight).then(done, () => done(null));
    };

    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const target = duration > 0.1 ? 0.1 : 0;
      // Setting currentTime to its current value is not required to emit
      // `seeked`; draw the already-decoded first frame directly in that case.
      if (target === 0 || Math.abs(video.currentTime - target) < 0.001) {
        draw();
        return;
      }
      try {
        video.currentTime = target;
      } catch {
        draw();
      }
    };
    video.onseeked = draw;
    video.onerror = () => done(null);

    if (options.signal?.aborted) {
      done(null);
      return;
    }
    options.signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => done(null), Math.max(1, timeoutMs));
    video.src = src;
  });
}

export function drawToJpeg(source: CanvasImageSource, srcW: number, srcH: number): Promise<Blob | null> {
  if (!srcW || !srcH) return Promise.resolve(null);
  const scale = Math.min(1, THUMB_MAX_EDGE / Math.max(srcW, srcH));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(srcW * scale));
  canvas.height = Math.max(1, Math.round(srcH * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  try {
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => {
      let settled = false;
      const done = (blob: Blob | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(blob);
      };
      const timer = setTimeout(() => done(null), CANVAS_ENCODE_TIMEOUT_MS);
      try {
        canvas.toBlob(done, 'image/jpeg', 0.82);
      } catch {
        done(null);
      }
    });
  } catch {
    return Promise.resolve(null);
  }
}
