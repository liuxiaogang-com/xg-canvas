/* Settings API — the merged account-admin surface now lives on canvas-api at
 * /api/v1/admin/* (+ /api/v1/stats for usage). Uses the shared cookie-auth
 * `api` client, so admin calls carry the session and pass the RBAC PermissionGuard. */

import { api } from '../api/client';
import type {
  Channel,
  ConfigSyncStatus,
  CredentialView,
  DreaminaStatusView,
  DreaminaLoginStart,
  DreaminaLoginPoll,
  MemberStats,
  FeatureConfig,
  ModelDefinition,
  ModelStats,
  ProjectStats,
  BillingOverview,
  BillingRow,
  Provider,
  ProviderStatusView,
  RequestLogRow,
  StatsOverview,
  SyncResult,
  VendorModelList,
  ObjectStorageSettings,
  SmtpSettings,
} from './types';

/* ── providers ───────────────────────────────────────────────── */
export const providerApi = {
  list: () => api<Provider[]>('/admin/providers'),
  get: (id: string) => api<Provider>(`/admin/providers/${id}`),
  create: (body: Partial<Provider>) => api<Provider>('/admin/providers', { method: 'POST', body }),
  update: (id: string, body: Partial<Provider>) => api<Provider>(`/admin/providers/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api<void>(`/admin/providers/${id}`, { method: 'DELETE' }),
  status: (id: string) => api<ProviderStatusView>(`/admin/providers/${id}/status`),
  vendorModels: (id: string) => api<VendorModelList>(`/admin/providers/${id}/models`),
  importModels: (id: string, model_ids: string[]) =>
    api<{ created: string[]; skipped: string[] }>(`/admin/providers/${id}/models/import`, {
      method: 'POST',
      body: { model_ids },
    }),
  probeModels: (id: string, api_key: string) =>
    api<VendorModelList>(`/admin/providers/${id}/probe-models`, { method: 'POST', body: { api_key } }),
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
  listByProvider: (providerId: string) => api<Channel[]>(`/admin/providers/${providerId}/channels`),
  create: (providerId: string, body: Partial<Channel>) =>
    api<Channel>(`/admin/providers/${providerId}/channels`, { method: 'POST', body }),
  update: (id: string, body: Partial<Channel>) => api<Channel>(`/admin/channels/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api<void>(`/admin/channels/${id}`, { method: 'DELETE' }),
};

/* ── credentials ─────────────────────────────────────────────── */
export const credentialApi = {
  listByChannel: (channelId: string) => api<CredentialView[]>(`/admin/channels/${channelId}/credentials`),
  // backend DTO field is `credentials` (the encrypted payload); map from `payload` here.
  create: (channelId: string, body: { label?: string; credential_type: string; payload: Record<string, string> }) =>
    api<CredentialView>(`/admin/channels/${channelId}/credentials`, {
      method: 'POST',
      body: { label: body.label, credential_type: body.credential_type, credentials: body.payload },
    }),
  remove: (id: string) => api<void>(`/admin/credentials/${id}`, { method: 'DELETE' }),
  validate: (id: string) => api<CredentialView>(`/admin/credentials/${id}/validate`, { method: 'POST' }),
  balance: (id: string) => api<ProviderStatusView>(`/admin/credentials/${id}/balance`),
  // Credential-centric add-key (auto default channel + enable selected models).
  addKey: (body: {
    provider_id: string;
    label?: string;
    payload: Record<string, string>;
    model_ids?: string[];
    preset_model_ids?: string[];
  }) =>
    api<{
      credential: CredentialView;
      credentials?: CredentialView[];
      imported?: { created: string[]; skipped: string[] };
      enabledPresets?: number;
    }>('/admin/credentials', {
      method: 'POST',
      body,
    }),
};

/* ── model definitions ───────────────────────────────────────── */
export const modelApi = {
  list: (all?: boolean) =>
    api<ModelDefinition[]>(`/admin/models${all ? '?all=true' : ''}`),
  get: (id: string) => api<ModelDefinition>(`/admin/models/${id}`),
  update: (id: string, body: Partial<ModelDefinition>) =>
    api<ModelDefinition>(`/admin/models/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api<void>(`/admin/models/${id}`, { method: 'DELETE' }),
};

/* ── config sync + registry ──────────────────────────────────── */
export const configSyncApi = {
  status: () => api<ConfigSyncStatus>('/admin/config-sync/status'),
  sync: () => api<SyncResult>('/admin/config-sync/sync', { method: 'POST' }),
  reloadRegistry: () => api<{ loaded: number; files: string[] }>('/admin/v1/registry/reload', { method: 'POST' }),
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
  get: (key: string) => api<FeatureConfig>(`/admin/feature-configs/${encodeURIComponent(key)}`),
  upsert: (key: string, body: Partial<FeatureConfig>) =>
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
