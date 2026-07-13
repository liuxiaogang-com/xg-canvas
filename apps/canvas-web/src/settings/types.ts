/* Settings (merged account-admin) types — mirror canvas-api account entities. */

export interface Provider {
  id: string;
  slug: string;
  display_name: string;
  icon_url: string | null;
  homepage_url: string | null;
  base_url: string | null;
  auth_method: string;
  auth_config: Record<string, unknown> | null;
  default_invocation_method: string;
  sdk_package: string | null;
  enabled: boolean;
  sort_order: number;
  description: string | null;
  documentation_url: string | null;
  supported_regions: string[];
  source: string;
  created_at: string;
  updated_at: string;
}

export interface Channel {
  id: string;
  provider_id: string;
  slug: string;
  display_name: string;
  invocation_method: string;
  base_url: string | null;
  request_config: Record<string, unknown> | null;
  load_balance_strategy: string;
  weight: number;
  rate_limit_rpm: number | null;
  rate_limit_tpm: number | null;
  daily_quota: number | null;
  concurrent_limit: number;
  enabled: boolean;
  priority: number;
  health_status: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface CredentialView {
  id: string;
  channel_id: string;
  label: string | null;
  credential_type: string;
  payload_fields: string[];
  enabled: boolean;
  is_valid: boolean;
  last_validated_at: string | null;
  validation_error: string | null;
  expires_at: string | null;
  auto_refresh: boolean;
  last_used_at: string | null;
  total_usage_count: number;
  source: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModelDefinition {
  id: string;
  provider_id: string;
  model_id: string;
  provider_model_id: string;
  display_name: string;
  description: string | null;
  icon_url: string | null;
  tags: string[];
  task_types: string[];
  capabilities: string[];
  invocation_mode: string;
  supports_streaming: boolean;
  allowed_channel_ids: string[];
  param_schema: Record<string, unknown> | null;
  param_constraints: unknown[] | null;
  limits: Record<string, unknown> | null;
  pricing: Record<string, unknown> | null;
  enabled: boolean;
  deprecated: boolean;
  sort_order: number;
  source: string;
  created_at: string;
  updated_at: string;
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

export interface SyncResult {
  providers: { created: number; updated: number; skipped: number };
  channels: { created: number; updated: number; skipped: number };
  models: { created: number; updated: number; skipped: number };
  errors: string[];
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

export interface ConfigSyncStatus {
  syncing: boolean;
  last_sync_at: string | null;
  last_result: SyncResult | null;
}

export interface VendorModel {
  id: string;
  /** Already present in our model_definitions for this provider. */
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
  created_at: string;
  finished_at: string | null;
  source: string;
  operation: string | null;
  owner_id: string | null;
  model_id: string | null;
  provider_slug: string | null;
  adapter_key: string | null;
  channel_id: string | null;
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
  estimated_cost: number;
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
  estimated_cost: number;
}

export interface ProjectStats {
  project_id: string | null;
  project_name: string | null;
  total: number;
  succeeded: number;
  failed: number;
  estimated_cost: number;
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
  display_name: string;
  description: string | null;
  model_ids: string[];
  primary_model_id: string | null;
  fallback_model_id: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
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
