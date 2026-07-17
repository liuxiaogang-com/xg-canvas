import { api } from './client';
import type { ModelInputContract, TaskType } from '@xgcanvas/shared-types';
import { modelSchemaCacheKey, type ModelCatalogIdentity } from './model-identity';

export type { ModelCatalogIdentity } from './model-identity';

export interface ModelProviderRef {
  key: string;
  display_name: string;
  icon_url: string;
}

export interface RichModelSummary extends ModelCatalogIdentity {
  display_name: string;
  description: string;
  provider: ModelProviderRef;
  task_types: TaskType[];
  capabilities: string[];
  invocation_mode: 'sync' | 'async' | 'stream';
  supports_streaming: boolean;
  tags: string[];
  deprecated: boolean;
  deprecated_message?: string;
  input_contract?: ModelInputContract;
  pricing_summary: string;
}

export type ParamControl = 'chips' | 'select' | 'slider' | 'number' | 'toggle';

export interface ParamOption {
  value: string | number;
  label: string;
}

export interface ParamSpec {
  field: string;
  label: string;
  control: ParamControl;
  options?: ParamOption[];
  min?: number;
  max?: number;
  step?: number;
  default?: unknown;
  advanced?: boolean;
}

export interface ModelSchemaResponse extends ModelCatalogIdentity {
  params: ParamSpec[];
  defaults: Record<string, unknown>;
  input_contract?: ModelInputContract;
}

export interface CostEstimate {
  estimated_cost: number | null;
  currency: string | null;
  breakdown: string;
}

export interface ValidateParamsResult {
  ok: boolean;
  errors: { field: string; message: string }[];
}

const SCHEMA_CACHE_MS = 30_000;
const schemaCache = new Map<string, { expiresAt: number; value: Promise<ModelSchemaResponse> }>();
const modelIdentityById = new Map<string, ModelCatalogIdentity>();

function rememberIdentity(identity: ModelCatalogIdentity): void {
  const previous = modelIdentityById.get(identity.model_id);
  modelIdentityById.set(identity.model_id, identity);
  if (previous && modelSchemaCacheKey(previous) !== modelSchemaCacheKey(identity)) {
    schemaCache.delete(modelSchemaCacheKey(previous));
  }
}

function loadModelSchema(selection: string | ModelCatalogIdentity): Promise<ModelSchemaResponse> {
  const modelId = typeof selection === 'string' ? selection : selection.model_id;
  const identity = typeof selection === 'string' ? modelIdentityById.get(modelId) : selection;
  // A caller that did not first read the current Catalog list has no revision
  // identity. Fetch directly instead of reusing a model-id-only cache entry.
  if (!identity) {
    return api<ModelSchemaResponse>(`/models/schema?id=${encodeURIComponent(modelId)}`).then(
      (schema) => {
        rememberIdentity(schema);
        return schema;
      },
    );
  }
  const key = modelSchemaCacheKey(identity);
  const cached = schemaCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  let value: Promise<ModelSchemaResponse>;
  value = api<ModelSchemaResponse>(`/models/schema?id=${encodeURIComponent(modelId)}`)
    .then((schema) => {
      rememberIdentity(schema);
      const actualKey = modelSchemaCacheKey(schema);
      if (actualKey !== key && schemaCache.get(key)?.value === value) {
        schemaCache.delete(key);
        schemaCache.set(actualKey, {
          expiresAt: Date.now() + SCHEMA_CACHE_MS,
          value: Promise.resolve(schema),
        });
      }
      return schema;
    })
    .catch((error) => {
      if (schemaCache.get(key)?.value === value) schemaCache.delete(key);
      throw error;
    });
  schemaCache.set(key, { expiresAt: Date.now() + SCHEMA_CACHE_MS, value });
  return value;
}

export type ModelSummary = RichModelSummary;

export const modelApi = {
  list: async (taskType?: TaskType) => {
    const models = await api<RichModelSummary[]>(
      `/models${taskType ? `?task_type=${encodeURIComponent(taskType)}` : ''}`,
    );
    models.forEach(rememberIdentity);
    return models;
  },
  schema: loadModelSchema,
  estimateCost: (model_id: string, params: Record<string, unknown>) =>
    api<CostEstimate>('/models/estimate-cost', { method: 'POST', body: { model_id, params } }),
  validate: (model_id: string, params: Record<string, unknown>) =>
    api<ValidateParamsResult>('/models/validate-params', {
      method: 'POST',
      body: { model_id, params },
    }),
};
