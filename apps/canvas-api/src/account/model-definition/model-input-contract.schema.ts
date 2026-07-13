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
  .passthrough()
  .superRefine((library, context) => {
    reportDuplicates(library.kinds, context, 'library kind');
    reportDuplicates(library.forms, context, 'library form');
  });

const InputSlotSchema = z
  .object({
    slot: z.string().min(1),
    type: z.enum(GENERATION_REFERENCE_TYPES),
    required: z.boolean().optional(),
    min: z.number().int().min(0).max(1000).optional(),
    max: z.number().int().min(0).max(1000).optional(),
    library: LibraryInputSchema.optional(),
  })
  .passthrough()
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
  .passthrough()
  .superRefine((mode, context) => {
    const slots = [...(mode.required_slots ?? []), ...(mode.optional_slots ?? [])];
    reportDuplicates(
      slots.map((slot) => slot.slot),
      context,
      'slot',
    );
  });

export const ModelInputContractSchema = z
  .object({
    default_mode: z.string().min(1).optional(),
    modes: z.array(InputModeSchema).min(1),
  })
  .passthrough()
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

export const OptionalModelInputContractSchema = z.preprocess(
  (value) => (value == null || isBlankRecord(value) ? undefined : value),
  ModelInputContractSchema.optional(),
);

export type OptionalModelInputContractResult =
  | { success: true; data: ModelInputContract | undefined }
  | { success: false; message: string };

/** Blank legacy DB values mean “no contract”; non-blank invalid values fail closed. */
export function parseOptionalModelInputContract(value: unknown): OptionalModelInputContractResult {
  if (value == null || isBlankRecord(value)) return { success: true, data: undefined };
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

function isBlankRecord(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

function reportDuplicates(values: string[], context: z.RefinementCtx, label: string): void {
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
