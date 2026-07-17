import type { ModelParamSchema } from '@xgcanvas/constraint-engine';
import { z } from 'zod';
import { ModelParamSchemaSchema } from './param-contract-schema';

const ParamSchemaOverrideSchema = z.object({
  groups: z.unknown().optional(),
  properties: z.record(z.unknown()).optional(),
  required: z.unknown().optional(),
  defaults: z.record(z.unknown()).optional(),
}).strict();

const ParamSchemaReferenceSchema = z.object({
  extends: z.string().min(1),
  override: ParamSchemaOverrideSchema.optional(),
}).strict();

export function resolveParamSchema(
  schemaConfig: unknown,
  templates: ReadonlyMap<string, unknown>,
): ModelParamSchema {
  if (schemaConfig === undefined) return emptyParamSchema();
  if (!isRecord(schemaConfig) || !('extends' in schemaConfig)) return ensureStandardSchema(schemaConfig);

  const reference = ParamSchemaReferenceSchema.parse(schemaConfig);
  const templateRef = reference.extends.replace(/^templates\//, '');
  const template = templates.get(templateRef);
  if (!isRecord(template)) throw new Error(`unknown param_schema template: ${templateRef}`);
  return ensureStandardSchema(deepMergeSchema(template, reference.override ?? {}));
}

export function ensureStandardSchema(schemaConfig: unknown): ModelParamSchema {
  if (!isRecord(schemaConfig) || !isRecord(schemaConfig.properties)) {
    throw new Error('param_schema must use the canonical properties/groups structure');
  }
  if ('extends' in schemaConfig) {
    throw new Error('param_schema extends must be resolved before normalization');
  }
  return ModelParamSchemaSchema.parse(schemaConfig);
}

export function deepMergeSchema(
  template: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const parsedOverride = ParamSchemaOverrideSchema.parse(override);
  const result: Record<string, unknown> = { ...template };
  if (parsedOverride.groups !== undefined) result.groups = parsedOverride.groups;
  if (isRecord(parsedOverride.properties)) {
    result.properties = { ...(isRecord(template.properties) ? template.properties : {}) };
    Object.assign(result.properties as Record<string, unknown>, parsedOverride.properties);
  }
  if (parsedOverride.required !== undefined) result.required = parsedOverride.required;
  if (isRecord(parsedOverride.defaults)) {
    result.defaults = {
      ...(isRecord(template.defaults) ? template.defaults : {}),
      ...parsedOverride.defaults,
    };
  }
  return result;
}

export function emptyParamSchema(): ModelParamSchema {
  return { version: '1.0', groups: [], properties: {}, required: [], defaults: {} };
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
