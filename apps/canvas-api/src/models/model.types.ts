import type { ModelInputContract, TaskType } from '@xgcanvas/shared-types';

/**
 * Normalized model contract served by canvas-api to canvas-web.
 * This is the single shape the canvas inline form consumes (list / schema /
 * cost). In DEMO_MODE it is produced by DemoModelRegistry; otherwise it is
 * mapped from account-api's model-list responses (see model-mappers.ts).
 */

export interface ModelProviderRef {
  key: string; // provider slug, e.g. 'jimeng'
  display_name: string;
  icon_url: string;
}

export interface RichModelSummary {
  id: string;
  display_name: string;
  description: string;
  provider: ModelProviderRef;
  task_types: TaskType[];
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
  params: ParamSpec[];
  defaults: Record<string, unknown>;
  input_contract?: ModelInputContract;
}

export interface CostEstimate {
  estimated_credits: number;
  currency: string; // 'credits' for the demo compute-credit unit
  breakdown: string;
}

export interface ValidateParamsResult {
  ok: boolean;
  errors: { field: string; message: string }[];
}

/** Raw JSON-schema-ish pricing block as stored on model_definitions / demo models. */
export interface ModelPricing {
  unit: 'token' | 'image' | 'second' | 'character' | 'minute';
  price?: number;
  input_price?: number;
  output_price?: number;
  currency?: string;
}
