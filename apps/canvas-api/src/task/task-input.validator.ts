import { BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';

const INPUT_KEYS = new Set([
  'mode',
  'prompt',
  'prompt_doc',
  'negative_prompt',
  'references',
  'audio_url',
  'json',
]);
const MAX_REFERENCES = 32;
const MAX_SLOT_LENGTH = 80;
const MAX_METADATA_STRING_LENGTH = 500;
const REFERENCE_TYPES = new Set([
  'image',
  'image_list',
  'video',
  'audio',
  'mask',
  'style_token',
  'entity_ref',
  'library_ref',
  'json',
]);

const REFERENCE_KEYS = new Set([
  'slot',
  'type',
  'asset_id',
  'library_entry_id',
  'weight',
  'order',
  'metadata',
]);

const METADATA_KEYS = new Set([
  'source',
  'mention_id',
  'label',
  'ref_kind',
  'entity_kind',
  'node_type',
  'cover_asset_id',
  'material_asset_count',
]);

/**
 * Validate the public task-input boundary. URLs, local paths, and adapter
 * metadata are internal values and must never be accepted from task callers.
 */
export function validatePublicTaskInputs(inputs: Record<string, unknown>): void {
  for (const key of Object.keys(inputs)) {
    if (!INPUT_KEYS.has(key)) {
      fail(`inputs.${key} is not accepted by the public task API`);
    }
  }

  if (inputs.references !== undefined) {
    if (!Array.isArray(inputs.references)) fail('inputs.references must be an array');
    if (inputs.references.length > MAX_REFERENCES) {
      fail(`inputs.references allows at most ${MAX_REFERENCES} items`);
    }
    inputs.references.forEach((value, index) => validateReference(value, index));
  }

  if (inputs.audio_url !== undefined && inputs.audio_url !== null && inputs.audio_url !== '') {
    if (typeof inputs.audio_url !== 'string' || !isUUID(inputs.audio_url)) {
      fail('inputs.audio_url must be an asset UUID; raw URLs are not accepted');
    }
  }
}

function validateReference(value: unknown, index: number): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`inputs.references[${index}] must be an object`);
  }
  const ref = value as Record<string, unknown>;
  for (const key of Object.keys(ref)) {
    if (!REFERENCE_KEYS.has(key)) {
      fail(`inputs.references[${index}].${key} is not accepted from clients`);
    }
  }

  if (typeof ref.slot !== 'string' || !ref.slot.trim() || ref.slot.length > MAX_SLOT_LENGTH) {
    fail(`inputs.references[${index}].slot is required`);
  }
  if (ref.type !== undefined && (typeof ref.type !== 'string' || !REFERENCE_TYPES.has(ref.type))) {
    fail(`inputs.references[${index}].type is invalid`);
  }

  const assetId = optionalUuid(ref.asset_id, `inputs.references[${index}].asset_id`);
  const libraryId = optionalUuid(
    ref.library_entry_id,
    `inputs.references[${index}].library_entry_id`,
  );
  if (Boolean(assetId) === Boolean(libraryId)) {
    fail(`inputs.references[${index}] must contain exactly one of asset_id or library_entry_id`);
  }
  if (libraryId && ref.type !== undefined && ref.type !== 'library_ref') {
    fail(`inputs.references[${index}] with library_entry_id must use type "library_ref"`);
  }
  if (assetId && ref.type === 'library_ref') {
    fail(`inputs.references[${index}] with type "library_ref" must use library_entry_id`);
  }

  if (
    ref.weight !== undefined &&
    (typeof ref.weight !== 'number' || !Number.isFinite(ref.weight))
  ) {
    fail(`inputs.references[${index}].weight must be a finite number`);
  }
  if (
    ref.order !== undefined &&
    (typeof ref.order !== 'number' || !Number.isInteger(ref.order) || ref.order < 0)
  ) {
    fail(`inputs.references[${index}].order must be a non-negative integer`);
  }
  if (ref.metadata !== undefined) validateMetadata(ref.metadata, index);
}

function validateMetadata(value: unknown, index: number): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`inputs.references[${index}].metadata must be an object`);
  }
  const metadata = value as Record<string, unknown>;
  for (const key of Object.keys(metadata)) {
    if (!METADATA_KEYS.has(key)) {
      fail(`inputs.references[${index}].metadata.${key} is reserved for server use`);
    }
  }
  if (metadata.source !== undefined && metadata.source !== 'prompt_mention') {
    fail(`inputs.references[${index}].metadata.source is invalid`);
  }
  for (const key of ['mention_id', 'label', 'ref_kind', 'entity_kind', 'node_type'] as const) {
    if (
      metadata[key] !== undefined &&
      (typeof metadata[key] !== 'string' || metadata[key].length > MAX_METADATA_STRING_LENGTH)
    ) {
      fail(`inputs.references[${index}].metadata.${key} must be a string`);
    }
  }
  if (
    metadata.cover_asset_id !== undefined &&
    (typeof metadata.cover_asset_id !== 'string' || !isUUID(metadata.cover_asset_id))
  ) {
    fail(`inputs.references[${index}].metadata.cover_asset_id must be a UUID`);
  }
  if (
    metadata.material_asset_count !== undefined &&
    (typeof metadata.material_asset_count !== 'number' ||
      !Number.isInteger(metadata.material_asset_count) ||
      metadata.material_asset_count < 1 ||
      metadata.material_asset_count > 1000)
  ) {
    fail(
      `inputs.references[${index}].metadata.material_asset_count must be an integer between 1 and 1000`,
    );
  }
}

function optionalUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !isUUID(value)) fail(`${field} must be a UUID`);
  return value as string;
}

function fail(message: string): never {
  throw new BadRequestException({ code: 'VALIDATION_FAILED', message });
}
