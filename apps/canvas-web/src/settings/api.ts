/* Settings API — the merged account-admin surface now lives on canvas-api at
 * /api/v1/admin/* (+ /api/v1/stats for usage). Uses the shared cookie-auth
 * `api` client, so admin calls carry the session and pass the RBAC PermissionGuard. */

import { api } from '../api/client';
import type {
  Capability,
  CatalogVisibility,
  ModelInputContract,
  ProviderAuthMethod,
  TaskType,
} from '@xgcanvas/shared-types';
import type {
  Channel,
  CredentialCatalogView,
  CredentialView,
  DreaminaStatusView,
  DreaminaLoginStart,
  DreaminaLoginPoll,
  MemberStats,
  FeatureConfig,
  FeatureConfigModelOption,
  ModelDefinition,
  ModelInvocationMode,
  ModelParamSchemaV1,
  ModelStats,
  ProjectStats,
  BillingOverview,
  BillingRow,
  Provider,
  ProviderStatusView,
  RequestLogRow,
  StatsOverview,
  VendorModelList,
  ObjectStorageSettings,
  SmtpSettings,
} from './types';

export interface CreateModelInput {
  provider_resource_uid: string;
  model_id: string;
  provider_model_id: string;
  display_name: string;
  description?: string;
  icon_url?: string;
  tags?: string[];
  task_types: TaskType[];
  capabilities: Capability[];
  invocation_mode: ModelInvocationMode;
  supports_streaming: boolean;
  adapter_key: string;
  allowed_channel_resource_uids: string[];
  param_schema: ModelParamSchemaV1;
  param_constraints: unknown[];
  input_contract?: ModelInputContract;
  poll_policy?: Record<string, unknown>;
  limits?: Record<string, unknown>;
  pricing?: Record<string, unknown> | null;
  enabled?: boolean;
  visibility?: CatalogVisibility;
  deprecated_message?: string;
  sort_order?: number;
}

export interface CreateProviderInput {
  slug: string;
  display_name: string;
  icon_url?: string;
  homepage_url?: string;
  base_url?: string;
  auth_method?: ProviderAuthMethod;
  auth_config?: Record<string, unknown>;
  invocation_methods?: string[];
  adapter_keys: string[];
  sdk_package?: string;
  enabled?: boolean;
  sort_order?: number;
  description?: string;
  documentation_url?: string;
  supported_regions?: string[];
}

export type UpdateProviderInput = Partial<Omit<CreateProviderInput, 'slug'>> & {
  expected_revision?: number;
  reset_config_overrides?: Array<'base_url' | 'auth_config'>;
};

export interface CreateChannelInput {
  slug: string;
  display_name: string;
  invocation_method: string;
  adapter_keys: string[];
  base_url?: string;
  request_config?: Record<string, unknown>;
  enabled?: boolean;
  priority?: number;
}

export type UpdateChannelInput = Partial<Omit<CreateChannelInput, 'slug'>> & {
  expected_revision?: number;
  reset_config_overrides?: Array<
    | 'base_url'
    | 'request_config'
  >;
};

export interface UpdateModelInput {
  expected_revision?: number;
  expected_rate_revision?: number;
  provider_model_id?: string;
  display_name?: string;
  description?: string;
  icon_url?: string;
  tags?: string[];
  task_types?: TaskType[];
  capabilities?: string[];
  invocation_mode?: string;
  supports_streaming?: boolean;
  adapter_key?: string;
  allowed_channel_resource_uids?: string[];
  param_schema?: Record<string, unknown>;
  param_constraints?: unknown[];
  input_contract?: Record<string, unknown>;
  poll_policy?: Record<string, unknown>;
  limits?: Record<string, unknown>;
  pricing?: Record<string, unknown> | null;
  enabled?: boolean;
  visibility?: 'public' | 'internal' | 'hidden';
  lifecycle?: 'active' | 'deprecated';
  deprecated_message?: string;
  sort_order?: number;
}

export interface ForkModelInput {
  expected_source_revision: number;
  new_model_id: string;
  display_name?: string;
}

/* ── providers ───────────────────────────────────────────────── */
export const providerApi = {
  list: () => api<Provider[]>('/admin/providers'),
  get: (resourceUid: string) => api<Provider>(`/admin/providers/${resourceUid}`),
  create: (body: CreateProviderInput) => api<Provider>('/admin/providers', { method: 'POST', body }),
  update: (resourceUid: string, body: UpdateProviderInput) => api<Provider>(`/admin/providers/${resourceUid}`, { method: 'PATCH', body }),
  remove: (resourceUid: string) => api<void>(`/admin/providers/${resourceUid}`, { method: 'DELETE' }),
  status: (resourceUid: string) => api<ProviderStatusView>(`/admin/providers/${resourceUid}/status`),
  vendorModels: (
    resourceUid: string,
    channelResourceUid: string,
    contractProfile: 'openai-text-chat-stream',
  ) => {
    const query = new URLSearchParams({
      channel_resource_uid: channelResourceUid,
      contract_profile: contractProfile,
    });
    return api<VendorModelList>(`/admin/providers/${resourceUid}/models?${query.toString()}`);
  },
  importModels: (
    resourceUid: string,
    channelResourceUid: string,
    vendorModelIds: string[],
    contract_profile: 'openai-text-chat-stream',
  ) =>
    api<{ created: string[]; skipped: string[] }>(`/admin/providers/${resourceUid}/models/import`, {
      method: 'POST',
      body: {
        channel_resource_uid: channelResourceUid,
        vendor_model_ids: vendorModelIds,
        contract_profile,
      },
    }),
  probeModels: (
    resourceUid: string,
    channelResourceUid: string,
    api_key: string,
    contract_profile: 'openai-text-chat-stream',
  ) => api<VendorModelList>(`/admin/providers/${resourceUid}/probe-models`, {
    method: 'POST',
    body: { channel_resource_uid: channelResourceUid, api_key, contract_profile },
  }),
};

export type ObjectStorageInput = {
  endpoint: string;
  port?: number;
  use_ssl: boolean;
  force_path_style: boolean;
  region: string;
  bucket: string;
  browser_s3_endpoint?: string;
  access_key?: string;
  secret_key?: string;
};

export const objectStorageApi = {
  get: () => api<ObjectStorageSettings>('/admin/system-settings/object-storage'),
  update: (body: ObjectStorageInput) =>
    api<ObjectStorageSettings>('/admin/system-settings/object-storage', { method: 'PUT', body }),
  test: (body: ObjectStorageInput) =>
    api<{ ok: true } & ObjectStorageSettings>('/admin/system-settings/object-storage/test', {
      method: 'POST',
      body,
    }),
};

export type SmtpInput = {
  host: string;
  port?: number;
  secure?: boolean;
  from: string;
  user?: string;
  pass?: string;
};

export const smtpApi = {
  get: () => api<SmtpSettings>('/admin/system-settings/smtp'),
  update: (body: SmtpInput) =>
    api<SmtpSettings>('/admin/system-settings/smtp', { method: 'PUT', body }),
  test: (body: SmtpInput) =>
    api<{ ok: true } & SmtpSettings>('/admin/system-settings/smtp/test', { method: 'POST', body }),
};

/* ── channels ────────────────────────────────────────────────── */
export const channelApi = {
  listByProvider: (providerResourceUid: string) => api<Channel[]>(`/admin/providers/${providerResourceUid}/channels`),
  create: (providerResourceUid: string, body: CreateChannelInput) =>
    api<Channel>(`/admin/providers/${providerResourceUid}/channels`, { method: 'POST', body }),
  update: (resourceUid: string, body: UpdateChannelInput) => api<Channel>(`/admin/channels/${resourceUid}`, { method: 'PATCH', body }),
  remove: (resourceUid: string) => api<void>(`/admin/channels/${resourceUid}`, { method: 'DELETE' }),
};

/* ── credentials ─────────────────────────────────────────────── */
export const credentialApi = {
  catalog: () => api<CredentialCatalogView>('/admin/credential-catalog'),
  listByChannel: (channelResourceUid: string) => api<CredentialView[]>(`/admin/channels/${channelResourceUid}/credentials`),
  // backend DTO field is `credentials` (the encrypted payload); map from `payload` here.
  create: (
    channelResourceUid: string,
    body: {
      label?: string;
      credential_type: 'api_key' | 'cli_session';
      payload: Record<string, string>;
    },
  ) =>
    api<CredentialView>(`/admin/channels/${channelResourceUid}/credentials`, {
      method: 'POST',
      body: { label: body.label, credential_type: body.credential_type, credentials: body.payload },
    }),
  remove: (id: string) => api<void>(`/admin/credentials/${id}`, { method: 'DELETE' }),
  validate: (id: string) => api<CredentialView>(`/admin/credentials/${id}/validate`, { method: 'POST' }),
  balance: (id: string) => api<ProviderStatusView>(`/admin/credentials/${id}/balance`),
  // Atomic onboarding for one exact Channel + Credential + selected models.
  addKey: (body: {
    provider_resource_uid: string;
    channel_resource_uid: string;
    label?: string;
    payload: Record<string, string>;
    vendor_model_ids?: string[];
    vendor_model_profile?: 'openai-text-chat-stream';
    preset_model_resource_uids?: string[];
  }) =>
    api<{
      credential: CredentialView;
      imported?: { created: string[]; skipped: string[] };
      enabledPresets: number;
    }>('/admin/credentials', {
      method: 'POST',
      body,
    }),
};

/* ── model definitions ───────────────────────────────────────── */
export const modelApi = {
  list: (all?: boolean) =>
    api<ModelDefinition[]>(`/admin/models${all ? '?all=true' : ''}`),
  get: (resourceUid: string) => api<ModelDefinition>(`/admin/models/${resourceUid}`),
  create: (body: CreateModelInput) =>
    api<ModelDefinition>('/admin/models', { method: 'POST', body }),
  update: (resourceUid: string, body: UpdateModelInput) =>
    api<ModelDefinition>(`/admin/models/${resourceUid}`, { method: 'PATCH', body }),
  fork: (resourceUid: string, body: ForkModelInput) =>
    api<ModelDefinition>(`/admin/models/${resourceUid}/fork`, { method: 'POST', body }),
  remove: (resourceUid: string) => api<void>(`/admin/models/${resourceUid}`, { method: 'DELETE' }),
};

/* ── dreamina CLI ────────────────────────────────────────────── */
export const dreaminaApi = {
  status: () => api<DreaminaStatusView>('/admin/dreamina/status'),
  login: () => api<DreaminaLoginStart>('/admin/dreamina/login', { method: 'POST' }),
  loginStatus: (deviceCode: string) =>
    api<DreaminaLoginPoll>(`/admin/dreamina/login/status?device_code=${encodeURIComponent(deviceCode)}`),
  logout: () => api<void>('/admin/dreamina/logout', { method: 'POST' }),
};

/* ── request logs ────────────────────────────────────────────── */
export const requestLogApi = {
  list: (q: { status?: string; provider_slug?: string; model_id?: string; limit?: number } = {}) => {
    const p = new URLSearchParams();
    if (q.status) p.set('status', q.status);
    if (q.provider_slug) p.set('provider_slug', q.provider_slug);
    if (q.model_id) p.set('model_id', q.model_id);
    p.set('limit', String(q.limit ?? 100));
    return api<RequestLogRow[]>(`/admin/request-logs?${p.toString()}`);
  },
  get: (id: string) => api<RequestLogRow>(`/admin/request-logs/${id}`),
  purge: (body: { before_days?: number; status?: string }) =>
    api<{ deleted: number }>('/admin/request-logs/purge', { method: 'POST', body }),
  analyze: (id: string) =>
    api<{ analysis: string; model_id: string | null; request_id?: string }>(
      `/admin/request-logs/${id}/analyze`,
      { method: 'POST' },
    ),
};

/* ── usage stats ─────────────────────────────────────────────── */
export const statsApi = {
  overview: () => api<StatsOverview>('/stats/overview'),
  byModel: () => api<ModelStats[]>('/stats/by-model'),
  byMember: () => api<MemberStats[]>('/stats/by-member'),
  byProject: () => api<ProjectStats[]>('/stats/by-project'),
};

/* ── feature model config ─────────────────────────────────────── */
export const featureConfigApi = {
  list: () => api<FeatureConfig[]>('/admin/feature-configs'),
  modelOptions: () => api<FeatureConfigModelOption[]>('/admin/feature-configs/model-options'),
  get: (key: string) => api<FeatureConfig>(`/admin/feature-configs/${encodeURIComponent(key)}`),
  upsert: (key: string, body: {
    feature_key: string;
    display_name: string;
    description?: string;
    model_resource_uids: string[];
    enabled?: boolean;
  }) =>
    api<FeatureConfig>(`/admin/feature-configs/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body,
    }),
  delete: (key: string) => api<void>(`/admin/feature-configs/${encodeURIComponent(key)}`, { method: 'DELETE' }),
};

/* ── billing (real per-request cost) ─────────────────────────── */
export const billingApi = {
  overview: () => api<BillingOverview>('/admin/billing/overview'),
  byModel: () => api<BillingRow[]>('/admin/billing/by-model'),
  byMember: () => api<BillingRow[]>('/admin/billing/by-member'),
  byProject: () => api<BillingRow[]>('/admin/billing/by-project'),
};
