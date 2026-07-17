import { randomUUID, createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable, Logger } from '@nestjs/common';
import { AdapterError } from '@xgcanvas/adapters-contract';
import type { AssetDownloaderPort, DownloadInput } from '@xgcanvas/adapters-contract';
import { ERROR_CODES, type StorageDescriptor } from '@xgcanvas/shared-types';

import { ObjectStorageClient } from './object-storage.client';
import { guardedFetch } from '../../common/http/guarded-outbound';

const DEFAULT_MAX_BYTES = 512 * 1024 * 1024; // 512MB
const DEFAULT_TIMEOUT_MS = 60_000;

interface KeyContext {
  workspaceId: string;
  projectId?: string;
  taskId: string;
  signal?: AbortSignal;
}

@Injectable()
export class AssetDownloaderService {
  private readonly logger = new Logger(AssetDownloaderService.name);

  constructor(private readonly storage: ObjectStorageClient) {}

  /**
   * Build a downloader bound to a task context. Adapters receive this as
   * `ctx.downloader` so storage_keys carry the right workspace/project path.
   */
  forTask(ctx: KeyContext): AssetDownloaderPort {
    return {
      download: (input) => this.run(ctx, input),
    };
  }

  private async run(ctx: KeyContext, input: DownloadInput): Promise<StorageDescriptor> {
    const max = Math.min(input.max_bytes ?? DEFAULT_MAX_BYTES, DEFAULT_MAX_BYTES);
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error('asset download timed out')),
      DEFAULT_TIMEOUT_MS,
    );
    const abortFromCaller = () => controller.abort(ctx.signal?.reason);
    ctx.signal?.addEventListener('abort', abortFromCaller, { once: true });
    if (ctx.signal?.aborted) abortFromCaller();
    const dir = await mkdtemp(join(tmpdir(), 'xgcanvas-asset-'));
    const tempPath = join(dir, 'download.bin');

    try {
      const res = await guardedFetch(
        input.url,
        {
          signal: controller.signal,
          headers: input.headers,
        },
        { redirect: 'follow' },
      );
      if (!res.ok || !res.body) {
        throw new AdapterError({
          code: ERROR_CODES.ASSET_DOWNLOAD_FAILED,
          message: `download failed: ${res.status} ${res.statusText}`,
          retryable: res.status >= 500,
        });
      }
      const declared = Number(res.headers.get('content-length') ?? 0);
      if (declared > max) {
        throw new AdapterError({
          code: ERROR_CODES.ASSET_TOO_LARGE,
          message: `asset exceeded ${max} bytes`,
        });
      }
      const { sha256, size } = await streamToFile(res.body, tempPath, max, controller.signal);
      const mime = input.mime_type ?? res.headers.get('content-type') ?? 'application/octet-stream';
      const ext = guessExtension(input.filename, mime);
      const key = buildStorageKey(ctx, ext);
      const bucket = await this.storage.bucket();
      await this.storage.putObject({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(tempPath),
        ContentLength: size,
        ContentType: mime,
      });
      return {
        storage_key: key,
        bucket,
        size_bytes: size,
        mime_type: mime,
        sha256,
      };
    } catch (e) {
      if (e instanceof AdapterError) throw e;
      throw new AdapterError({
        code: ERROR_CODES.ASSET_DOWNLOAD_FAILED,
        message: e instanceof Error ? e.message : String(e),
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
      ctx.signal?.removeEventListener('abort', abortFromCaller);
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function streamToFile(
  body: ReadableStream<Uint8Array>,
  path: string,
  maxBytes: number,
  signal: AbortSignal,
): Promise<{ sha256: string; size: number }> {
  const hash = createHash('sha256');
  let size = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > maxBytes) {
        callback(
          new AdapterError({
            code: ERROR_CODES.ASSET_TOO_LARGE,
            message: `asset exceeded ${maxBytes} bytes`,
          }),
        );
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(body as never),
    limiter,
    createWriteStream(path, { flags: 'wx' }),
    { signal },
  );
  return { sha256: hash.digest('hex'), size };
}

function buildStorageKey(ctx: KeyContext, ext: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const project = ctx.projectId ?? '_workspace';
  return `xgcanvas/${ctx.workspaceId}/${project}/${yyyy}/${mm}/${dd}/${randomUUID()}${ext}`;
}

function guessExtension(filename: string | undefined, mime: string): string {
  if (filename) {
    const m = filename.match(/(\.[a-z0-9]+)$/i);
    if (m) return m[1].toLowerCase();
  }
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'application/json': '.json',
    'text/plain': '.txt',
  };
  return map[mime.split(';')[0].trim()] ?? '.bin';
}
