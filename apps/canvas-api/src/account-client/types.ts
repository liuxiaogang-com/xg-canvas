import type { TaskStatus, TaskType, StorageDescriptor } from '@xgcanvas/shared-types';

/**
 * Mirror of UnifiedRequest/Response from adapters-contract — duplicated
 * here because it's the wire format with account-api, and we don't want
 * canvas-api importing the adapter side directly.
 */

export interface InvokeRequest {
  task_id: string;
  task_type: TaskType;
  model_id: string;
  workspace_id: string;
  owner_id?: string;
  project_id?: string;
  params: Record<string, unknown>;
  inputs?: Record<string, unknown>;
  channel_id?: string;
  credential_id?: string;
  stream?: boolean;
  idempotency_key?: string;
}

export interface ProducedAsset {
  asset_type: 'image' | 'video' | 'audio' | 'text' | 'json';
  storage: StorageDescriptor;
  role?: string;
}

export interface InvokeResponse {
  status: TaskStatus;
  channel_id?: string;
  credential_id?: string;
  external_task_id?: string;
  assets: ProducedAsset[];
  text?: string;
  json?: unknown;
  usage?: { input_tokens?: number; output_tokens?: number; cost?: number; cost_currency?: string };
  progress?: number;
  error?: { code: string; message: string };
  next_poll_after_ms?: number;
}

export interface PollRequest {
  task_id: string;
  external_task_id: string;
  model_id: string;
  workspace_id: string;
  project_id?: string;
  channel_id: string;
  credential_id: string;
}

export interface PollResponse {
  response: InvokeResponse;
  next_poll_after_ms?: number;
}

export interface CancelRequest {
  external_task_id: string;
  model_id: string;
  channel_id: string;
  credential_id: string;
}

export interface ModelSummary {
  id: string;
  provider_key: string;
  adapter_key: string;
  task_types: TaskType[];
  invocation_mode: 'sync' | 'async' | 'stream';
}
