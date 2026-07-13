import { api } from './client';
import type { ModelInputContract } from '@xgcanvas/shared-types';

export interface ModelProviderRef {
  key: string;
  display_name: string;
  icon_url: string;
}

export interface RichModelSummary {
  id: string;
  display_name: string;
  description: string;
  provider: ModelProviderRef;
  task_types: string[];
  capabilities: string[];
  invocation_mode: 'sync' | 'async' | 'stream';
  supports_streaming: boolean;
  tags: string[];
  deprecated: boolean;
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

export interface ModelSchemaResponse {
  model_id: string;
  params: ParamSpec[];
  defaults: Record<string, unknown>;
  input_contract?: ModelInputContract;
}

export interface CostEstimate {
  estimated_credits: number;
  currency: string;
  breakdown: string;
}

export interface ValidateParamsResult {
  ok: boolean;
  errors: { field: string; message: string }[];
}

const SCHEMA_CACHE_MS = 30_000;
const schemaCache = new Map<string, { expiresAt: number; value: Promise<ModelSchemaResponse> }>();

function loadModelSchema(id: string): Promise<ModelSchemaResponse> {
  const cached = schemaCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  let value: Promise<ModelSchemaResponse>;
  value = api<ModelSchemaResponse>(`/models/schema?id=${encodeURIComponent(id)}`).catch((error) => {
    if (schemaCache.get(id)?.value === value) schemaCache.delete(id);
    throw error;
  });
  schemaCache.set(id, { expiresAt: Date.now() + SCHEMA_CACHE_MS, value });
  return value;
}

/** Back-compat alias — older callers (quick-gen ModelPicker) imported ModelSummary. */
export type ModelSummary = RichModelSummary;

export const modelApi = {
  list: (taskType?: string) =>
    api<RichModelSummary[]>(`/models${taskType ? `?task_type=${encodeURIComponent(taskType)}` : ''}`),
  schema: loadModelSchema,
  estimateCost: (model_id: string, params: Record<string, unknown>) =>
    api<CostEstimate>('/models/estimate-cost', { method: 'POST', body: { model_id, params } }),
  validate: (model_id: string, params: Record<string, unknown>) =>
    api<ValidateParamsResult>('/models/validate-params', { method: 'POST', body: { model_id, params } }),
};
