import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';

const MAX_BYTES = 64 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_REDIRECTS = 3;

/**
 * Dreamina CLI needs local paths. Flow:
 *   executor signs asset_id → temporary GET URL
 *   → this session downloads that URL into a temp file
 *   → adapter passes the local path to `dreamina --images=...`
 */
export class LocalMediaSession {
  private constructor(
    private readonly dir: string,
    private readonly maxBytes: number,
    private readonly timeoutMs: number,
  ) {}

  static async create(options: { maxBytes?: number; timeoutMs?: number } = {}): Promise<LocalMediaSession> {
    const dir = await mkdtemp(join(tmpdir(), 'xgcanvas-dreamina-'));
    return new LocalMediaSession(
      dir,
      options.maxBytes ?? MAX_BYTES,
      options.timeoutMs ?? DOWNLOAD_TIMEOUT_MS,
    );
  }

  /** Download a Nest-issued presigned URL to a temp file; return local path. */
  async fetch(url: string, signal?: AbortSignal): Promise<string> {
    const initial = parseHttpUrl(url);
    rejectSensitiveLiteralHost(initial);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('reference media download timed out')), this.timeoutMs);
    const abortFromCaller = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abortFromCaller, { once: true });

    let path: string | null = null;
    try {
      const res = await fetchSameOrigin(initial, controller.signal);
      if (!res.ok) {
        throw new Error(`download signed reference failed: HTTP ${res.status}`);
      }
      const len = Number(res.headers.get('content-length') ?? 0);
      if (len > this.maxBytes) throw new Error(`reference media exceeds ${this.maxBytes} bytes`);
      const ext = extFrom(res.url || url, res.headers.get('content-type'));
      path = join(this.dir, `ref-${randomUUID()}${ext}`);
      if (!res.body) throw new Error('download signed reference failed: empty body');

      let bytes = 0;
      const maxBytes = this.maxBytes;
      const limiter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length;
          if (bytes > maxBytes) {
            callback(new Error(`reference media exceeds ${maxBytes} bytes`));
            return;
          }
          callback(null, chunk);
        },
      });
      await pipeline(
        Readable.fromWeb(res.body as never),
        limiter,
        createWriteStream(path, { flags: 'wx' }),
        { signal: controller.signal },
      );
      const size = (await stat(path)).size;
      if (size <= 0) throw new Error('download signed reference failed: 0-byte file');
      return path;
    } catch (error) {
      if (path) await unlink(path).catch(() => undefined);
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  async dispose(): Promise<void> {
    await rm(this.dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function fetchSameOrigin(initial: URL, signal: AbortSignal): Promise<Response> {
  let current = initial;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetch(current, { signal, redirect: 'manual' });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get('location');
    if (!location) throw new Error(`signed reference redirect ${response.status} has no location`);
    if (redirects === MAX_REDIRECTS) throw new Error('signed reference exceeded redirect limit');
    const next = new URL(location, current);
    if (next.origin !== initial.origin) {
      throw new Error('signed reference redirected to a different origin');
    }
    current = next;
  }
  throw new Error('signed reference redirect failed');
}

function parseHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Dreamina reference must be an HTTP(S) asset URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Dreamina reference must be an HTTP(S) asset URL');
  }
  if (url.username || url.password) throw new Error('signed reference URL must not contain credentials');
  return url;
}

function rejectSensitiveLiteralHost(url: URL): void {
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    host === 'localhost' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.startsWith('127.') ||
    host === '169.254.169.254'
  ) {
    throw new Error('signed reference host is not allowed');
  }
}

function extFrom(url: string, mime: string | null): string {
  try {
    const path = new URL(url).pathname;
    const ext = extname(path).toLowerCase();
    if (ext && ext.length <= 8) return ext;
  } catch {
    /* ignore */
  }
  if (mime?.includes('png')) return '.png';
  if (mime?.includes('webp')) return '.webp';
  if (mime?.includes('gif')) return '.gif';
  if (mime?.includes('mp4')) return '.mp4';
  if (mime?.includes('webm')) return '.webm';
  if (mime?.includes('wav')) return '.wav';
  if (mime?.includes('audio') || mime?.includes('mpeg') || mime?.includes('mp3')) return '.mp3';
  return '.jpg';
}
