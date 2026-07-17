import type { LibraryProviderRef } from './library';

export const GENERATION_MODES = [
  'text_to_image',
  'image_to_image',
  'image_edit',
  'text_to_video',
  'image_to_video',
  'first_last_frame',
  'reference_to_video',
  'audio_driven_video',
  'video_continue',
  'text_to_audio',
] as const;

export type GenerationMode = (typeof GENERATION_MODES)[number];

export const GENERATION_REFERENCE_SLOTS = [
  'source_image',
  'reference_image',
  'mask',
  'style_image',
  'first_frame',
  'last_frame',
  'first_clip',
  'source_video',
  'driving_audio',
  'character_ref',
  'scene_ref',
  'object_ref',
] as const;

export type GenerationReferenceSlot = (typeof GENERATION_REFERENCE_SLOTS)[number];

export const GENERATION_REFERENCE_TYPES = [
  'image',
  'image_list',
  'video',
  'audio',
  'mask',
  'style_token',
  'entity_ref',
  'library_ref',
  'json',
] as const;

export type GenerationReferenceType = (typeof GENERATION_REFERENCE_TYPES)[number];

export const LIBRARY_INPUT_FORMS = ['material', 'provider_ref'] as const;
export type LibraryInputForm = (typeof LIBRARY_INPUT_FORMS)[number];

interface GenerationReferenceBase {
  slot: GenerationReferenceSlot | string;
  type: GenerationReferenceType;
  weight?: number;
  order?: number;
}

/**
 * Public/client generation reference. Callers may identify an owned asset or
 * a readable library entry, but may never provide a URL, local path, or
 * adapter metadata. canvas-api resolves this into a trusted reference before
 * crossing the account-client seam.
 */
interface ClientGenerationReferenceBase extends GenerationReferenceBase {
  /** UI-only provenance; the server validates and strips it before invoke. */
  metadata?: ClientGenerationReferenceMetadata;
}

export interface AssetGenerationReference extends ClientGenerationReferenceBase {
  asset_id: string;
  library_entry_id?: never;
}

export interface LibraryGenerationReference extends ClientGenerationReferenceBase {
  type: 'library_ref';
  library_entry_id: string;
  asset_id?: never;
}

/** Public references have exactly one server-resolved identifier. */
export type GenerationReference = AssetGenerationReference | LibraryGenerationReference;

export interface ClientGenerationReferenceMetadata {
  source?: 'prompt_mention';
  mention_id?: string;
  label?: string;
  ref_kind?: PromptMentionKind;
  entity_kind?: 'character' | 'scene' | 'prop' | 'storyboard';
  node_type?: string;
  /** UI preview only; stripped before the adapter boundary. */
  cover_asset_id?: string;
  /**
   * UI capacity hint for a material-backed library entry. The server never
   * trusts this value: it loads the entry and validates the expanded refs.
   */
  material_asset_count?: number;
}

/** Adapter-facing library metadata created only by canvas-api. */
export interface ResolvedLibraryReferenceMetadata {
  entry_id: string;
  kind: string;
  name: string;
  provider_refs: LibraryProviderRef[];
}

/**
 * Internal reference after asset/library permission checks. Only this shape is
 * allowed in UnifiedRequest; it is not accepted by public task APIs.
 */
export interface ResolvedGenerationReference extends GenerationReferenceBase {
  url?: string;
  mime_type?: string;
  metadata?: Record<string, unknown>;
}

export type PromptMentionKind = 'asset' | 'entity' | 'node';

export interface PromptMentionRef {
  kind: PromptMentionKind;
  id: string;
  asset_type?: 'image' | 'video' | 'audio' | 'text' | 'json';
  entity_kind?: 'character' | 'scene' | 'prop' | 'storyboard';
  node_type?: string;
  output_type?: GenerationReferenceType | 'text';
  slot_hint?: GenerationReferenceSlot | string;
  asset_id?: string;
}

export interface PromptMention {
  id: string;
  label: string;
  token: string;
  ref: PromptMentionRef;
}

export type PromptSegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; mention_id: string; label: string; token: string; ref: PromptMentionRef };

export interface PromptDocument {
  version: 1;
  text: string;
  mentions: PromptMention[];
  segments: PromptSegment[];
}

export interface GenerationInput {
  mode?: GenerationMode | string;
  prompt?: string;
  prompt_doc?: PromptDocument;
  negative_prompt?: string;
  references?: GenerationReference[];
  json?: unknown;
}

export interface InputSlotContract {
  slot: GenerationReferenceSlot | string;
  type: GenerationReferenceType;
  min?: number;
  max?: number;
  /**
   * Declares that this slot can consume library entries: which kinds
   * (character/voice/...) and in which forms. 'material' means the executor's
   * expanded asset urls are enough; 'provider_ref' means the adapter natively
   * injects the vendor resource id from metadata.library.provider_refs.
   */
  library?: {
    kinds: string[];
    forms: LibraryInputForm[];
  };
}

export interface InputModeContract {
  id: GenerationMode | string;
  label?: string;
  required_slots?: InputSlotContract[];
  optional_slots?: InputSlotContract[];
}

export interface ModelInputContract {
  default_mode?: GenerationMode | string;
  modes: InputModeContract[];
}
