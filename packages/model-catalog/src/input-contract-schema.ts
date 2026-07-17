import { z } from 'zod';
import {
  GENERATION_REFERENCE_TYPES,
  LIBRARY_INPUT_FORMS,
  type ModelInputContract,
} from '@xgcanvas/shared-types';

const LibraryInputSchema = z
  .object({
    kinds: z.array(z.string().min(1)).min(1),
    forms: z.array(z.enum(LIBRARY_INPUT_FORMS)).min(1),
  })
  .strict()
  .superRefine((library, context) => {
    reportDuplicates(library.kinds, context, 'library kind');
    reportDuplicates(library.forms, context, 'library form');
  });

const InputSlotSchema = z
  .object({
    slot: z.string().min(1),
    type: z.enum(GENERATION_REFERENCE_TYPES),
    min: z.number().int().min(0).max(1000).optional(),
    max: z.number().int().min(0).max(1000).optional(),
    library: LibraryInputSchema.optional(),
  })
  .strict()
  .superRefine((slot, context) => {
    if (slot.min !== undefined && slot.max !== undefined && slot.min > slot.max) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['min'],
        message: 'min must not exceed max',
      });
    }
  });

const InputModeSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).optional(),
    required_slots: z.array(InputSlotSchema).optional(),
    optional_slots: z.array(InputSlotSchema).optional(),
  })
  .strict()
  .superRefine((mode, context) => {
    const slots = [...(mode.required_slots ?? []), ...(mode.optional_slots ?? [])];
    reportDuplicates(
      slots.map((slot) => slot.slot),
      context,
      'slot',
    );
    validateSlotCollection(mode.required_slots ?? [], true, context);
    validateSlotCollection(mode.optional_slots ?? [], false, context);
  });

export const ModelInputContractSchema = z
  .object({
    default_mode: z.string().min(1).optional(),
    modes: z.array(InputModeSchema).min(1),
  })
  .strict()
  .superRefine((contract, context) => {
    const modeIds = contract.modes.map((mode) => mode.id);
    reportDuplicates(modeIds, context, 'mode');
    if (contract.default_mode && !modeIds.includes(contract.default_mode)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['default_mode'],
        message: 'default_mode must reference a declared mode',
      });
    }
  });

export const OptionalModelInputContractSchema = ModelInputContractSchema.optional();

export type OptionalModelInputContractResult =
  | { success: true; data: ModelInputContract | undefined }
  | { success: false; message: string };

export function parseOptionalModelInputContract(value: unknown): OptionalModelInputContractResult {
  if (value === undefined) return { success: true, data: undefined };
  const parsed = ModelInputContractSchema.safeParse(value);
  if (parsed.success) {
    return { success: true, data: parsed.data as ModelInputContract };
  }
  return {
    success: false,
    message: parsed.error.errors
      .map((error) => `${error.path.join('.') || 'input_contract'}: ${error.message}`)
      .join('; '),
  };
}

function validateSlotCollection(
  slots: readonly { min?: number; max?: number }[],
  required: boolean,
  context: z.RefinementCtx,
): void {
  slots.forEach((slot, index) => {
    const minimum = slot.min ?? (required ? 1 : 0);
    const collection = required ? 'required_slots' : 'optional_slots';
    if (required && minimum < 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [collection, index, 'min'],
        message: 'required slot min must be at least 1',
      });
    }
    if (!required && minimum !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [collection, index, 'min'],
        message: 'optional slot min must be 0 or omitted',
      });
    }
    if (slot.max !== undefined && slot.max < minimum) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [collection, index, 'max'],
        message: 'max must not be lower than the effective min',
      });
    }
  });
}

function reportDuplicates(values: readonly string[], context: z.RefinementCtx, label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate ${label} "${value}"`,
      });
    }
    seen.add(value);
  }
}
