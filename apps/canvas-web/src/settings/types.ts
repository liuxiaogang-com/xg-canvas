/* Settings views returned by the Catalog-backed canvas-api admin surface. */

import type {
  Capability,
  CatalogOrigin,
  CatalogVisibility,
  ProviderAuthMethod,
  TaskType,
} from '@xgcanvas/shared-types';

export type ModelInvocationMode = 'sync' | 'async' | 'stream';

export interface ModelParamSchemaV1 {
  version: '1.0';
  groups: unknown[];
  properties: Record<string, unknown>;
  required: string[];
  defaults: Record<string, unknown>;
}

export interface Provider {
  resource_uid: string;
  revision: number;
  lifecycle: 'active' | 'deprecated';
  slug: string;
  display_name: string;
  icon_url?: string;
  homepage_url?: string;
  base_url?: string;
  auth_method: ProviderAuthMethod;
  auth_config?: Record<string, unknown>;
  invocation_methods: string[];
  adapter_keys: string[];
  sdk_package?: string;
  enabled: boolean;
  sort_order: number;
  description?: string;
  documentation_url?: string;
  supported_regions: string[];
  origin: CatalogOrigin;
}

export interface Channel {
  resource_uid: string;
  provider_resource_uid: string;
  revision: number;
  lifecycle: 'active' | 'deprecated';
  slug: string;
  display_name: string;
  invocation_method: string;
  adapter_keys: string[];
  base_url?: string;
  request_config: Record<string, unknown>;
  enabled: boolean;
  priority: number;
  origin: CatalogOrigin;
}

export interface CredentialView {
  id: string;
  channel_resource_uid: string;
  label: string | null;
  credential_type: 'api_key' | 'cli_session';
  payload_fields: string[];
  enabled: boolean;
  is_valid: boolean;
  last_validated_at: string | null;
  validation_error: string | null;
  expires_at: string | null;
  last_used_at: string | null;
  total_usage_count: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModelDefinition {
  resource_uid: string;
  provider_resource_uid: string;
  revision: number;
  lifecycle: 'active' | 'deprecated';
  model_id: string;
  provider_model_id: string;
  display_name: string;
  description: string | null;
  icon_url: string | null;
  tags: string[];
  task_types: TaskType[];
  capabilities: Capability[];
  invocation_mode: ModelInvocationMode;
  supports_streaming: boolean;
  adapter_key: string;
  allowed_channel_resource_uids: string[];
  param_schema: Record<string, unknown>;
  param_constraints: unknown[];
  input_contract?: Record<string, unknown>;
  poll_policy?: Record<string, unknown>;
  limits: Record<string, unknown>;
  pricing: Record<string, unknown> | null;
  rate_card_revision: number | null;
  rate_card_revision_id: string | null;
  enabled: boolean;
  visibility: CatalogVisibility;
  deprecated: boolean;
  deprecated_message?: string;
  sort_order: number;
  provider: {
    resource_uid: string;
    slug: string;
    display_name: string;
    icon_url?: string;
  };
  origin: CatalogOrigin;
}

export interface CredentialCatalogProvider {
  resource_uid: string;
  slug: string;
  display_name: string;
  auth_method: ProviderAuthMethod;
  adapter_keys: string[];
}

export interface CredentialCatalogChannel {
  resource_uid: string;
  provider_resource_uid: string;
  slug: string;
  display_name: string;
  adapter_keys: string[];
  enabled: boolean;
}

export interface CredentialCatalogModel {
  resource_uid: string;
  provider_resource_uid: string;
  model_id: string;
  provider_model_id: string;
  display_name: string;
  task_types: TaskType[];
  adapter_key: string;
  allowed_channel_resource_uids: string[];
  enabled: boolean;
  origin: CatalogOrigin;
}

export interface CredentialCatalogView {
  catalog_epoch: string;
  providers: CredentialCatalogProvider[];
  channels: CredentialCatalogChannel[];
  models: CredentialCatalogModel[];
  credentials: CredentialView[];
}

export interface DreaminaStatusView {
  logged_in: boolean;
  total_credit?: number;
  user_id?: string;
  user_name?: string;
  vip_level?: string; // '' / undefined = non-VIP (generation not allowed)
  error?: string;
}

export interface DreaminaLoginStart {
  verification_uri: string;
  user_code: string;
  device_code: string;
  expires_at: string | null;
}

export interface DreaminaLoginPoll {
  state: 'pending' | 'success' | 'no_permission' | 'expired' | 'failed';
  user_id?: string;
  message?: string;
}

export interface ObjectStorageSettings {
  configured: boolean;
  verified?: boolean;
  verified_at?: string | null;
  endpoint?: string;
  port?: number;
  use_ssl?: boolean;
  force_path_style?: boolean;
  region?: string;
  bucket?: string;
  browser_s3_endpoint?: string;
  has_access_key: boolean;
  has_secret_key: boolean;
}

export interface SmtpSettings {
  configured: boolean;
  verified?: boolean;
  verified_at?: string | null;
  host?: string;
  port?: number;
  secure?: boolean;
  from?: string;
  has_user: boolean;
  has_pass: boolean;
}

export interface VendorModel {
  id: string;
  /** Already represented by a current Catalog Model Resource for this provider. */
  imported: boolean;
}
export interface VendorModelList {
  models: VendorModel[];
  note?: string;
}

export interface ProviderStatusItem {
  label: string;
  value: string;
  tone?: 'success' | 'warning' | 'danger' | 'default';
}
export interface ProviderStatusView {
  items: ProviderStatusItem[];
  available?: boolean;
  note?: string;
}

export interface RequestLogRow {
  id: string;
  logical_request_id: string | null;
  attempt_no: number | null;
  created_at: string;
  finished_at: string | null;
  source: string;
  operation: string | null;
  owner_id: string | null;
  model_id: string | null;
  provider_slug: string | null;
  adapter_key: string | null;
  model_resource_uid: string | null;
  model_revision_id: string | null;
  rate_card_revision_id: string | null;
  catalog_epoch: string | null;
  channel_resource_uid: string | null;
  credential_label: string | null;
  status: string;
  http_status: number | null;
  latency_ms: number | null;
  request_summary: Record<string, unknown> | null;
  usage: Record<string, unknown> | null;
  error_code: string | null;
  error_message: string | null;
  vendor_error: unknown;
  request_body: unknown;
  response_body: unknown;
}

/* ── stats (canvas-api /stats) — shapes mirror StatsService results ── */

export interface StatsOverview {
  total: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  running: number;
  queued: number;
}

export interface ModelStats {
  model_id: string;
  total: number;
  succeeded: number;
  success_rate: number;
  last_used_at: string | null;
}

export interface MemberStats {
  owner_id: string;
  display_name: string | null;
  email: string | null;
  total: number;
  succeeded: number;
  failed: number;
}

export interface ProjectStats {
  project_id: string | null;
  project_name: string | null;
  total: number;
  succeeded: number;
  failed: number;
}

/* ── billing (real per-request cost over the request-log ledger) ── */

export interface BillingOverview {
  requests: number;
  success: number;
  error: number;
  input_tokens: number;
  output_tokens: number;
  by_currency: { currency: string; cost: number }[];
}

/* ── feature model config ─────────────────────────────────────── */

export interface FeatureConfig {
  id: string;
  feature_key: string;
  required_task_type: TaskType;
  display_name: string;
  description: string | null;
  model_resource_uids: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface FeatureConfigModelOption {
  resource_uid: string;
  model_id: string;
  display_name: string;
  task_types: TaskType[];
  enabled: boolean;
  provider: {
    display_name: string;
  };
}

export interface BillingRow {
  key: string | null;
  label: string | null;
  currency: string | null;
  requests: number;
  cost: number;
  input_tokens: number;
  output_tokens: number;
}
