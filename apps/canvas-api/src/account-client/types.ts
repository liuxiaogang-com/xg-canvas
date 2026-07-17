import type {
  ChannelRouteSnapshot,
  ModelRevisionPin,
  TaskStatus,
  TaskType,
  StorageDescriptor,
} from '@xgcanvas/shared-types';

/**
 * Mirror of UnifiedRequest/Response from adapters-contract — duplicated
 * here because it's the wire format with account-api, and we don't want
 * canvas-api importing the adapter side directly.
 */

interface InvokeRequestBase {
  task_id: string;
  task_type: TaskType;
  model_id: string;
  workspace_id: string;
  owner_id?: string;
  project_id?: string;
  params: Record<string, unknown>;
  inputs?: Record<string, unknown>;
  channel_resource_uid?: string;
  credential_id?: string;
  stream?: boolean;
  idempotency_key?: string;
  /** Stable Task-owned group persisted before any outbound adapter attempt. */
  logical_request_id?: string;
}

export type InvokeRequest = InvokeRequestBase &
  ({ resolution: { kind: 'current' } } | { resolution: { kind: 'pinned'; pin: ModelRevisionPin } });

export interface ProducedAsset {
  asset_type: 'image' | 'video' | 'audio' | 'text' | 'json';
  storage: StorageDescriptor;
  role?: string;
}

export interface InvokeResponse {
  status: TaskStatus;
  request_id?: string;
  channel_resource_uid?: string;
  channel_revision_id?: string;
  channel_route?: ChannelRouteSnapshot;
  credential_id?: string;
  external_task_id?: string;
  assets: ProducedAsset[];
  text?: string;
  json?: unknown;
  usage?: {
    input_tokens?: number;
    cached_input_tokens?: number;
    output_tokens?: number;
    image_count?: number;
    duration_seconds?: number;
    billing_tier?: string;
    cost?: number;
    cost_currency?: string;
  };
  progress?: number;
  error?: { code: string; message: string };
  next_poll_after_ms?: number;
}

export interface PollRequest extends ModelRevisionPin {
  task_id: string;
  external_task_id: string;
  model_id: string;
  workspace_id: string;
  owner_id?: string;
  project_id?: string;
  channel_resource_uid: string;
  channel_revision_id: string;
  channel_route: ChannelRouteSnapshot;
  credential_id: string;
}

export interface PollResponse {
  response: InvokeResponse;
  next_poll_after_ms?: number;
}

export interface CancelRequest extends ModelRevisionPin {
  task_id: string;
  external_task_id: string;
  model_id: string;
  workspace_id: string;
  owner_id?: string;
  project_id?: string;
  channel_resource_uid: string;
  channel_revision_id: string;
  channel_route: ChannelRouteSnapshot;
  credential_id: string;
}

export interface ModelSummary {
  id: string;
  provider_key: string;
  adapter_key: string;
  task_types: TaskType[];
  invocation_mode: 'sync' | 'async' | 'stream';
}
