import { AdapterError, type UnifiedRequest } from '@xgcanvas/adapters-contract';
import {
  ERROR_CODES,
  type ModelInputContract,
  type ResolvedGenerationReference,
} from '@xgcanvas/shared-types';

type UnifiedInputs = UnifiedRequest['inputs'];

export function normalizeInputsForContract(
  inputs: UnifiedInputs,
  contract: ModelInputContract | undefined,
): UnifiedInputs {
  if (!contract?.modes?.length) return inputs;
  const mode = inputs.mode ?? contract.default_mode ?? contract.modes[0]?.id;
  return mode ? { ...inputs, mode } : inputs;
}

export function validateInputContract(
  contract: ModelInputContract | undefined,
  inputs: UnifiedInputs,
): void {
  if (!contract?.modes?.length) return;
  const modeId = inputs.mode ?? contract.default_mode ?? contract.modes[0]?.id;
  const mode = contract.modes.find((m) => m.id === modeId);
  if (!mode) {
    fail(`mode "${String(modeId)}" is not supported by this model`);
  }

  const refs = Array.isArray(inputs.references) ? inputs.references : [];
  const slots = [...(mode.required_slots ?? []), ...(mode.optional_slots ?? [])];
  const declaredSlots = new Set(slots.map((slot) => slot.slot));
  for (const ref of refs) {
    if (!declaredSlots.has(ref?.slot)) {
      fail(`slot "${String(ref?.slot)}" is not declared by mode "${mode.id}"`);
    }
  }
  for (const slot of mode.required_slots ?? []) {
    const count = countSlot(refs, slot.slot);
    const min = slot.min ?? 1;
    if (count < min) fail(`slot "${slot.slot}" requires at least ${min} reference(s)`);
  }

  for (const slot of slots) {
    const slotRefs = refs.filter((r) => r?.slot === slot.slot);
    const count = slotRefs.length;
    if (slot.max !== undefined && count > slot.max) {
      fail(`slot "${slot.slot}" allows at most ${slot.max} reference(s)`);
    }
    for (const ref of slotRefs) {
      if (ref.type && !typeMatches(ref.type, slot.type)) {
        fail(`slot "${slot.slot}" expects ${slot.type}, got ${ref.type}`);
      }
      validateLibraryReference(ref, slot);
    }
  }
}

function validateLibraryReference(
  ref: ResolvedGenerationReference,
  slot: NonNullable<ModelInputContract['modes'][number]['required_slots']>[number],
): void {
  const library = (
    ref.metadata as
      | {
          library?: { kind?: unknown; provider_refs?: unknown[] };
        }
      | undefined
  )?.library;
  if (!library) return;
  if (!slot.library) fail(`slot "${slot.slot}" does not accept library entries`);
  const kind = typeof library.kind === 'string' ? library.kind : '';
  if (!slot.library.kinds.includes(kind)) {
    fail(`slot "${slot.slot}" does not accept library kind "${kind || 'unknown'}"`);
  }
  const form = ref.url ? 'material' : 'provider_ref';
  if (!slot.library.forms.includes(form)) {
    fail(`slot "${slot.slot}" does not accept library form "${form}"`);
  }
  if (form === 'provider_ref' && !library.provider_refs?.length) {
    fail(`slot "${slot.slot}" has no verified provider binding`);
  }
}

function countSlot(refs: ResolvedGenerationReference[], slot: string): number {
  return refs.filter((r) => r?.slot === slot).length;
}

function typeMatches(actual: string, expected: string): boolean {
  if (actual === expected) return true;
  return expected === 'image' && actual === 'image_list';
}

function fail(message: string): never {
  throw new AdapterError({
    code: ERROR_CODES.CONSTRAINT_VIOLATION,
    message,
    retryable: false,
  });
}
