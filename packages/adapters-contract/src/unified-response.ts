/**
 * UnifiedResponse - what a ProviderAdapter returns from invoke()/poll().
 * Spec: docs/task-lifecycle.md.
 *
 * Sync adapters return status='succeeded' with assets already downloaded
 * to our S3/R2-compatible bucket. Async adapters return status='running'
 * plus external_task_id; InvokeService schedules a poll. Failed responses
 * carry an ApiError.
 */

import type { ApiError, StorageDescriptor, TaskStatus } from '@xgcanvas/shared-types';

export interface UnifiedResponse {
  status: TaskStatus;
  /** Account route selected for this call. Filled by InvokeService, not adapters. */
  channel_id?: string;
  credential_id?: string;
  /** Vendor-side task id, required when status='running'. */
  external_task_id?: string;
  /** Localised assets already in our object bucket. */
  assets: ProducedAsset[];
  /** Plain-text result, e.g. chat completion. */
  text?: string;
  /** Structured result, e.g. extracted characters. */
  json?: unknown;
  /** Token usage / billing surface; null when unavailable. */
  usage?: UsageStats;
  /** Vendor-reported progress 0..1, optional. */
  progress?: number;
  error?: ApiError;
  /**
   * When the next poll should run. Adapters with no opinion may omit;
   * InvokeService falls back to the model's poll_policy.
   */
  next_poll_after_ms?: number;
}

export interface ProducedAsset {
  /** What kind of bytes this is; drives canvas.assets.type. */
  asset_type: 'image' | 'video' | 'audio' | 'text' | 'json';
  storage: StorageDescriptor;
  /** Free-form role tag for the consumer (e.g. "thumbnail", "frame_0"). */
  role?: string;
}

export interface UsageStats {
  input_tokens?: number;
  output_tokens?: number;
  /** Vendor-side credit / unit cost, if reported. */
  cost?: number;
  cost_currency?: string;
}
