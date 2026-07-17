/**
 * InvokeCtx - runtime context handed to every adapter call.
 * Carries decrypted credential payload, channel pointers, and the
 * AssetDownloader port adapters use to land vendor URLs in object storage.
 */

import type { StorageDescriptor } from '@xgcanvas/shared-types';

export interface InvokeCtx {
  /** Internal task id. Used for log correlation only. */
  task_id: string;
  /** Workspace + project the task belongs to (for storage_key path). */
  workspace_id: string;
  project_id?: string;
  channel: ChannelInfo;
  credential: DecryptedCredential;
  /** Adapters MUST go through this to fetch external bytes. */
  downloader: AssetDownloaderPort;
  logger: AdapterLogger;
  /** AbortSignal for cancellation; honoured by long calls / polls. */
  signal?: AbortSignal;
}

export interface ChannelInfo {
  resource_uid: string;
  /** e.g. "official", "openrouter", "self-hosted". */
  key: string;
  /** Vendor base URL override; empty string means "adapter default". */
  base_url?: string;
  /** Per-channel custom params (model name overrides, headers, ...). */
  options?: Record<string, unknown>;
}

/**
 * Decrypted credential payload. Adapters read what they need; the shape
 * varies by provider (api_key for HTTP, profile_id for CLI, etc).
 */
export interface DecryptedCredential {
  id: string;
  channel_resource_uid: string;
  type: 'api_key' | 'cli_session';
  /** The actual secret material; varies by type. */
  payload: Record<string, unknown>;
}

/**
 * AssetDownloader port implemented by account-api/storage. Adapters never
 * touch object storage directly. The implementation streams the URL through
 * a size cap, hashes the bytes, and uploads the result.
 */
export interface AssetDownloaderPort {
  download(input: DownloadInput): Promise<StorageDescriptor>;
}

export interface DownloadInput {
  /** Source URL supplied by the adapter, usually a vendor CDN URL. */
  url: string;
  /** Hint MIME type; downloader may overwrite from response headers. */
  mime_type?: string;
  /** Suggested filename / extension hint. */
  filename?: string;
  /** Cap; defaults to 512MB at the implementation. */
  max_bytes?: number;
  /** Optional HTTP headers (auth for the same-vendor follow-up URL). */
  headers?: Record<string, string>;
}

export interface AdapterLogger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}
