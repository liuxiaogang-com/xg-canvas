import type {
  GenerationReference,
  GenerationReferenceType,
  InputModeContract,
  InputSlotContract,
  ModelInputContract,
} from '@xgcanvas/shared-types';

import type { ParamSpec } from '../api/model';
import type { FormModeDef, FormReferenceSlot } from '../nodes/types';

export interface GenerationModeOption {
  id: string;
  label: string;
}

export interface GenerationSlotView {
  slot: string;
  type: GenerationReferenceType;
  label: string;
  required: boolean;
  min?: number;
  max?: number;
  port?: string;
  accept?: string;
  library?: InputSlotContract['library'];
}

export interface SplitModelParams {
  modelVersionSpec: ParamSpec | null;
  paramSpecs: ParamSpec[];
}

const SLOT_LABELS: Record<string, string> = {
  source_image: '参考图',
  reference_image: '参考图',
  mask: '蒙版',
  style_image: '风格图',
  first_frame: '首帧',
  last_frame: '尾帧',
  first_clip: '参考视频',
  source_video: '参考视频',
  driving_audio: '参考音频',
  character_ref: '角色',
  scene_ref: '场景',
  object_ref: '物品',
};

const MODEL_VERSION_FIELDS = new Set(['model_version']);

export function modeOptionsFromContract(
  contract: ModelInputContract | undefined,
  fallback: FormModeDef[] = [],
): FormModeDef[] {
  const contractModes = contract?.modes ?? [];
  if (contractModes.length === 0) return fallback;
  const fallbackById = new Map(fallback.map((mode) => [mode.id, mode]));
  return contractModes.map((mode) => {
    const local = fallbackById.get(mode.id);
    return {
      id: mode.id,
      label: mode.label ?? local?.label ?? humanizeMode(mode.id),
      requires: local?.requires,
    };
  });
}

export function quickModeOptions(contract: ModelInputContract | undefined): GenerationModeOption[] {
  return (contract?.modes ?? []).map((mode) => ({
    id: mode.id,
    label: mode.label ?? humanizeMode(mode.id),
  }));
}

export function ensureInputMode(
  contract: ModelInputContract | undefined,
  current: string | null | undefined,
): string | null {
  const modes = contract?.modes ?? [];
  if (modes.length === 0) return current ?? null;
  if (current && modes.some((mode) => mode.id === current)) return current;
  return contract?.default_mode ?? modes[0]?.id ?? null;
}

export function preferredModelId<T extends { id: string; input_contract?: ModelInputContract }>(
  models: T[],
): string | null {
  return (
    models.find((model) =>
      model.input_contract?.modes?.some((mode) => (mode.required_slots?.length ?? 0) === 0),
    )?.id ??
    models[0]?.id ??
    null
  );
}

export function splitModelVersionParam(specs: ParamSpec[]): SplitModelParams {
  const modelVersionSpec = specs.find((spec) => MODEL_VERSION_FIELDS.has(spec.field)) ?? null;
  return {
    modelVersionSpec,
    paramSpecs: specs.filter((spec) => spec !== modelVersionSpec),
  };
}

export function isValidParamValue(spec: ParamSpec, value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  if (!spec.options?.length) return true;
  return spec.options.some((option) => String(option.value) === String(value));
}

export function defaultParamValue(spec: ParamSpec): unknown {
  return spec.default ?? spec.options?.[0]?.value;
}

export function displayModelVersion(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '选择模型';
  if (/^\d+(?:\.\d+)?$/.test(raw)) return `Seedream ${raw}`;
  const seedance = raw.match(/^seedance(\d+(?:\.\d+)?)(fast)?(?:_(vip))?(?:([a-z]+))?$/i);
  if (seedance) {
    const [, version, fast, vip, suffix] = seedance;
    const parts = [`Seedance ${version}`];
    if (fast) parts.push('Fast');
    if (suffix) parts.push(titleCase(suffix));
    if (vip) parts.push('VIP');
    return parts.join(' ');
  }
  return raw;
}

export function modeContract(
  contract: ModelInputContract | undefined,
  modeId: string | null | undefined,
): InputModeContract | undefined {
  const modes = contract?.modes ?? [];
  if (modes.length === 0) return undefined;
  const id = modeId ?? contract?.default_mode ?? modes[0]?.id;
  return modes.find((mode) => mode.id === id) ?? modes[0];
}

export function slotsForMode(
  mode: InputModeContract | undefined,
  fallbackSlots: FormReferenceSlot[] = [],
  activePorts: string[] | null = null,
): GenerationSlotView[] {
  const contractSlots = [
    ...(mode?.required_slots ?? []).map((slot) => slotFromContract(slot, true, fallbackSlots)),
    ...(mode?.optional_slots ?? []).map((slot) => slotFromContract(slot, false, fallbackSlots)),
  ];
  if (contractSlots.length > 0) return contractSlots;
  return fallbackSlots
    .filter((slot) => !slot.advanced || activePorts?.includes(slot.port))
    .map((slot) => ({
      slot: slot.slot ?? slot.port,
      type: slot.type ?? acceptToReferenceType(slot.accept),
      label: slot.label,
      required: activePorts?.includes(slot.port) ?? !slot.advanced,
      port: slot.port,
      accept: slot.accept,
      library: undefined,
    }));
}

export function missingRequiredSlots(
  slots: GenerationSlotView[],
  refs: GenerationReference[],
): GenerationSlotView[] {
  return slots.filter((slot) => {
    if (!slot.required) return false;
    const min = slot.min ?? 1;
    const capacity = refs
      .filter((ref) => ref.slot === slot.slot)
      .reduce((sum, ref) => sum + referenceCapacity(ref), 0);
    return capacity < min;
  });
}

export function filterRefsForSlots(
  refs: GenerationReference[],
  slots: GenerationSlotView[],
): GenerationReference[] {
  const byName = new Map(slots.map((slot) => [slot.slot, slot]));
  if (byName.size === 0) return [];
  return reorderReferences(
    refs.filter((ref) => {
      const slot = byName.get(String(ref.slot));
      if (!slot) return false;
      if (ref.library_entry_id) return !!slot.library;
      if (!ref.type) return true;
      if (ref.type === 'library_ref') return false;
      return referenceTypeMatches(ref.type, slot.type);
    }),
  );
}

export function reorderReferences(refs: GenerationReference[]): GenerationReference[] {
  return refs.map((ref, order) => ({ ...ref, order }));
}

/**
 * Client-side capacity estimate. Library entries expand to their material
 * assets on the server, where the model contract is validated again using the
 * authoritative entry. Older saved refs fall back to one unit.
 */
export function referenceCapacity(ref: GenerationReference): number {
  if (!ref.library_entry_id) return 1;
  const count = ref.metadata?.material_asset_count;
  return typeof count === 'number' && Number.isInteger(count) && count > 0 ? count : 1;
}

export function referenceTypeMatches(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  if (expected === 'image' || expected === 'image_list') {
    return actual === 'image' || actual === 'image_list' || actual === 'grid';
  }
  return actual === expected;
}

export function slotLimitLabel(slot: GenerationSlotView): string {
  const min = slot.min ?? (slot.required ? 1 : 0);
  const max = slot.max;
  if (max && max > 1) return `${slot.required ? '必填' : '可选'} ${min}-${max}`;
  return slot.required ? '必填' : '可选';
}

function slotFromContract(
  slot: InputSlotContract,
  required: boolean,
  fallbackSlots: FormReferenceSlot[],
): GenerationSlotView {
  const fallback = fallbackSlots.find((item) => item.slot === slot.slot || item.port === slot.slot);
  return {
    slot: slot.slot,
    type: slot.type,
    label: fallback?.label ?? SLOT_LABELS[slot.slot] ?? humanizeMode(slot.slot),
    required,
    min: slot.min,
    max: slot.max,
    port: fallback?.port,
    accept: fallback?.accept,
    library: slot.library,
  };
}

/**
 * Until credential-aware provider bindings have a real verifier/consumer,
 * the picker exposes only library slots with a portable material fallback.
 */
export function selectableLibraryKinds(slot: GenerationSlotView): string[] {
  if (!slot.library?.forms.includes('material')) return [];
  return slot.library.kinds;
}

function acceptToReferenceType(accept: string): GenerationReferenceType {
  if (accept === 'audio') return 'audio';
  if (accept === 'video') return 'video';
  if (accept === 'mask') return 'mask';
  if (accept === 'style_token') return 'style_token';
  if (accept === 'entity_ref') return 'entity_ref';
  if (accept === 'json') return 'json';
  return accept === 'image_list' ? 'image_list' : 'image';
}

function humanizeMode(id: string): string {
  return id
    .split('_')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function titleCase(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1).toLowerCase();
}
