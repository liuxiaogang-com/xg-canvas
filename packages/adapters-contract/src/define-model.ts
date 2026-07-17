/**
 * Turns the runtime manifest flattened by RegistrySnapshotFactory from a
 * validated Catalog Revision into an adapter registry entry. It binds the
 * param schema and constraints to one validator and performs no Catalog,
 * database or file I/O.
 */

import {
  validateParams,
  type ModelParamSchema,
  type ParamConstraint,
  type ValidationResult,
} from '@xgcanvas/constraint-engine';
import type { Capability, ModelInputContract, TaskType } from '@xgcanvas/shared-types';

/** Adapter runtime contract; this is not the authoring YAML schema. */
export interface ModelManifestEntry {
  id: string;
  display_name: string;
  provider_key: string;
  adapter_key: string;
  /** Vendor-side identifier passed in UnifiedRequest.provider_model. */
  provider_model: string;
  task_types: TaskType[];
  /** Feature flags that gate UI controls / request building / constraints. */
  capabilities: Capability[];
  invocation_mode: 'sync' | 'async' | 'stream';
  param_schema: ModelParamSchema;
  input_contract?: ModelInputContract;
  constraints?: ParamConstraint[];
  /** Async polling defaults — overridden by adapter response if present. */
  poll_policy?: {
    initial_delay_ms: number;
    interval_ms: number;
    max_total_ms: number;
  };
  /** Operational fields, mirrored from DB after upsert. */
  enabled?: boolean;
  visibility?: 'public' | 'internal' | 'hidden';
}

export interface ModelRegistryEntry {
  manifest: ModelManifestEntry;
  /** Validates a params object against schema + constraints. */
  validate(params: Record<string, unknown>): ValidationResult;
}

export function defineModel(manifest: ModelManifestEntry): ModelRegistryEntry {
  const constraints = manifest.constraints ?? [];
  return {
    manifest,
    validate(params) {
      return validateParams(params, manifest.param_schema, constraints);
    },
  };
}
