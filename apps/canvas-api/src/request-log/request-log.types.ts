import type { ChannelRouteSnapshot } from '@xgcanvas/shared-types';

export type RequestLogStatus = 'pending' | 'success' | 'error' | 'timeout' | 'cancelled';

export interface FinalizePendingRequestLog {
  status: Exclude<RequestLogStatus, 'pending'>;
  usage?: Record<string, unknown> | null;
  http_status?: number | null;
  latency_ms?: number | null;
  error_code?: string | null;
  error_message?: string | null;
  vendor_error?: unknown;
  response_body?: unknown;
}

export interface UpdatePendingRequestLog {
  usage?: Record<string, unknown> | null;
  http_status?: number | null;
  latency_ms?: number | null;
  error_code?: string | null;
  error_message?: string | null;
  vendor_error?: unknown;
  response_body?: unknown;
}

/**
 * A completed request to persist. Caller pre-generates `id` (the request id)
 * at request start so it can be surfaced on error before this write happens.
 * IMPORTANT: request_summary must already be sanitized — never pass secrets.
 */
export interface RecordRequestLog {
  id: string;
  logical_request_id?: string | null;
  attempt_no?: number | null;
  source: string;
  operation?: string | null;
  owner_id?: string | null;
  workspace_id?: string | null;
  project_id?: string | null;
  task_id?: string | null;
  conversation_id?: string | null;
  provider_slug?: string | null;
  model_id?: string | null;
  model_resource_uid?: string | null;
  model_revision_id?: string | null;
  rate_card_revision_id?: string | null;
  catalog_epoch?: string | null;
  adapter_key?: string | null;
  channel_resource_uid?: string | null;
  channel_revision_id?: string | null;
  channel_route?: ChannelRouteSnapshot | null;
  credential_id?: string | null;
  credential_label?: string | null;
  status: RequestLogStatus;
  http_status?: number | null;
  latency_ms?: number | null;
  request_summary?: Record<string, unknown> | null;
  usage?: Record<string, unknown> | null;
  error_code?: string | null;
  error_message?: string | null;
  vendor_error?: unknown;
  /** Sanitized request context (messages / prompt) — what was sent to the model. */
  request_body?: unknown;
  /** Response content (text) — what came back. */
  response_body?: unknown;
}

export interface RequestLogQuery {
  status?: string;
  source?: string;
  provider_slug?: string;
  model_id?: string;
  owner_id?: string;
  /** created_at cursor (ISO) for keyset pagination. */
  before?: string;
  limit?: number;
}

export interface PurgeOptions {
  before?: Date;
  status?: string;
  provider_slug?: string;
}

export interface InvokeRecoveryAttempt {
  id: string;
  logical_request_id: string;
  attempt_no: number;
  status: RequestLogStatus;
  task_id: string;
  owner_id: string | null;
  workspace_id: string;
  project_id: string | null;
  model_id: string;
  model_resource_uid: string;
  model_revision_id: string;
  rate_card_revision_id: string | null;
  catalog_epoch: string;
  channel_resource_uid: string;
  channel_revision_id: string;
  channel_route: ChannelRouteSnapshot;
  credential_id: string;
  external_task_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: Date;
}

export interface AcceptedInvokeOrphan extends InvokeRecoveryAttempt {
  external_task_id: string;
  task_status: string | null;
  task_error: { code?: string; message?: string } | null;
  task_invoke_logical_request_id: string | null;
  task_invoke_request_id: string | null;
  task_external_task_id: string | null;
  task_lease_expires_at: Date | null;
  task_channel_resource_uid: string | null;
  task_channel_revision_id: string | null;
  task_credential_id: string | null;
}

export interface InvokePreflightFailure {
  id: string;
  status: 'error' | 'timeout' | 'cancelled';
  error_code: string | null;
  error_message: string | null;
}
