import type { ModelInputContract, TaskType } from '@xgcanvas/shared-types';

/**
 * Normalized model contract served by canvas-api to canvas-web.
 * This is the single shape the canvas inline form consumes (list / schema /
 * cost). Live and demo execution both consume the same Catalog snapshot.
 */

export interface ModelProviderRef {
  key: string; // provider slug, e.g. 'dreamina'
  display_name: string;
  icon_url: string;
}

export interface RichModelSummary {
  model_id: string;
  model_resource_uid: string;
  model_revision_id: string;
  catalog_epoch: string;
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

/** A single param control the inline form should render, derived from a model's param_schema. */
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
  model_resource_uid: string;
  model_revision_id: string;
  catalog_epoch: string;
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
