import { z } from 'zod';
import {
  CAPABILITIES,
  TASK_TYPES,
  TASK_TYPE_ALIASES,
  canonicaliseCapability,
  canonicaliseTaskType,
  isCapability,
  isTaskType,
} from '@xgcanvas/shared-types';

import { OptionalModelInputContractSchema } from '../model-definition/model-input-contract.schema';

// Keep the provider-file declaration type tractable while the dedicated
// schema still performs the full nested runtime validation.
const InputContractFieldSchema: z.ZodTypeAny = OptionalModelInputContractSchema;

/**
 * Zod schemas for YAML provider files. We intentionally keep this loose
 * (passthrough on nested objects) so existing files keep working, but
 * we still enforce the important contract: provider.slug, channels[].slug,
 * models[].model_id + task_types + invocation_mode, and that task_types /
 * capabilities use the canonical vocabulary (aliases ok, typos rejected).
 */

const taskTypeArray = z
  .array(z.string())
  .min(1)
  .superRefine((arr, ctx) => {
    for (const raw of arr) {
      if (!isTaskType(canonicaliseTaskType(raw))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `unknown task_type "${raw}" — use one of [${TASK_TYPES.join(', ')}] or an alias [${Object.keys(TASK_TYPE_ALIASES).join(', ')}]`,
        });
      }
    }
  });

const capabilityArray = z.array(z.string()).superRefine((arr, ctx) => {
  for (const raw of arr) {
    if (!isCapability(canonicaliseCapability(raw))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `unknown capability "${raw}" — use one of [${CAPABILITIES.join(', ')}]`,
      });
    }
  }
});

const ChannelSchema = z
  .object({
    slug: z.string().min(1),
    display_name: z.string().min(1),
    invocation_method: z.enum(['http', 'cli', 'sdk']),
    base_url: z.string().optional(),
    request_config: z.record(z.unknown()).optional(),
    load_balance_strategy: z.string().optional(),
    weight: z.number().optional(),
    rate_limit_rpm: z.number().optional(),
    rate_limit_tpm: z.number().optional(),
    daily_quota: z.number().optional(),
    concurrent_limit: z.number().optional(),
  })
  .passthrough();

const ModelSchema = z
  .object({
    model_id: z.string().min(1),
    provider_model_id: z.string().min(1),
    display_name: z.string().min(1),
    description: z.string().optional(),
    task_types: taskTypeArray,
    capabilities: capabilityArray.optional(),
    invocation_mode: z.enum(['sync', 'async', 'stream']).optional(),
    adapter_key: z.string().optional(),
    supports_streaming: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    deprecated: z.boolean().optional(),
    deprecated_message: z.string().optional(),
    param_schema: z.unknown().optional(),
    param_constraints: z.array(z.unknown()).optional(),
    input_contract: InputContractFieldSchema,
    poll_policy: z
      .object({
        initial_delay_ms: z.number(),
        interval_ms: z.number(),
        max_total_ms: z.number(),
      })
      .optional(),
    limits: z.record(z.unknown()).optional(),
    pricing: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const ProviderFileSchema = z
  .object({
    version: z.string(),
    provider: z
      .object({
        slug: z.string().min(1),
        display_name: z.string().min(1),
        adapter_keys: z.array(z.string()).optional(),
        invocation_methods: z.array(z.string()).optional(),
        default_invocation_method: z.string().optional(),
      })
      .passthrough(),
    channels: z.array(ChannelSchema).optional(),
    models: z.array(ModelSchema).optional(),
  })
  .passthrough();

export type ProviderFile = z.infer<typeof ProviderFileSchema>;

export interface ValidationFailure {
  filePath: string;
  message: string;
}

export function validateProviderFile(
  filePath: string,
  raw: unknown,
): { ok: true; data: ProviderFile } | { ok: false; failure: ValidationFailure } {
  const parsed = ProviderFileSchema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    failure: {
      filePath,
      message: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
    },
  };
}
