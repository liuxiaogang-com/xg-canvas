import type {
  GenerationReference,
  GenerationReferenceType,
  PromptDocument,
  PromptMention,
  PromptMentionRef,
  PromptSegment,
} from '@xgcanvas/shared-types';

import { referenceCapacity, type GenerationSlotView } from './input-contract-ui';

export type MentionTone =
  | 'asset-image'
  | 'asset-video'
  | 'asset-audio'
  | 'asset-text'
  | 'asset-json'
  | 'entity-character'
  | 'entity-scene'
  | 'entity-prop'
  | 'entity-storyboard'
  | 'node'
  | 'unknown';

export interface MentionCandidate {
  key: string;
  label: string;
  subtitle?: string;
  tone: MentionTone;
  ref: PromptMentionRef;
}

export interface MentionAssetLike {
  id: string;
  type: 'image' | 'video' | 'audio' | 'text' | 'json';
  name?: string | null;
  tags?: string[] | null;
  role?: string | null;
  scope?: string | null;
}

const ENTITY_SLOT_BY_KIND: Record<string, string> = {
  character: 'character_ref',
  scene: 'scene_ref',
  prop: 'object_ref',
  storyboard: 'scene_ref',
};

const ASSET_TYPE_LABEL: Record<MentionAssetLike['type'], string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  text: '文本',
  json: '数据',
};

export function emptyPromptDocument(text = ''): PromptDocument {
  return buildPromptDocument(text, []);
}

export function isPromptDocument(value: unknown): value is PromptDocument {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as PromptDocument).version === 1 &&
    typeof (value as PromptDocument).text === 'string' &&
    Array.isArray((value as PromptDocument).mentions) &&
    Array.isArray((value as PromptDocument).segments),
  );
}

export function mentionFromCandidate(candidate: MentionCandidate): PromptMention {
  const label = cleanMentionLabel(candidate.label);
  return {
    id: candidate.key,
    label,
    token: `@${label}`,
    ref: candidate.ref,
  };
}

export function upsertMention(mentions: PromptMention[], mention: PromptMention): PromptMention[] {
  return [...mentions.filter((item) => item.id !== mention.id), mention];
}

export function buildPromptDocument(text: string, mentions: PromptMention[]): PromptDocument {
  const uniqueMentions = uniqueByToken(mentions).filter((mention) => text.includes(mention.token));
  const positions = uniqueMentions
    .flatMap((mention) => findTokenPositions(text, mention))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const segments: PromptSegment[] = [];
  const usedMentionIds = new Set<string>();
  let cursor = 0;

  for (const pos of positions) {
    if (pos.start < cursor) continue;
    if (pos.start > cursor) segments.push({ type: 'text', text: text.slice(cursor, pos.start) });
    segments.push({
      type: 'mention',
      mention_id: pos.mention.id,
      label: pos.mention.label,
      token: pos.mention.token,
      ref: pos.mention.ref,
    });
    usedMentionIds.add(pos.mention.id);
    cursor = pos.end;
  }

  if (cursor < text.length || segments.length === 0) {
    segments.push({ type: 'text', text: text.slice(cursor) });
  }

  return {
    version: 1,
    text,
    mentions: uniqueMentions.filter((mention) => usedMentionIds.has(mention.id)),
    segments,
  };
}

export function assetToMentionCandidate(asset: MentionAssetLike): MentionCandidate {
  const typeLabel = ASSET_TYPE_LABEL[asset.type];
  const label = cleanMentionLabel(
    asset.name || asset.role || asset.tags?.[0] || `${typeLabel}${shortId(asset.id)}`,
  );
  return {
    key: `asset:${asset.id}`,
    label,
    subtitle: asset.scope ? `${typeLabel} · ${asset.scope}` : typeLabel,
    tone: `asset-${asset.type}` as MentionTone,
    ref: {
      kind: 'asset',
      id: asset.id,
      asset_id: asset.id,
      asset_type: asset.type,
      output_type: asset.type === 'text' ? 'text' : asset.type,
    },
  };
}

export function promptDocumentReferences(
  document: PromptDocument | undefined,
  slots: GenerationSlotView[],
): GenerationReference[] {
  if (!document || slots.length === 0) return [];
  const counts = new Map<string, number>();
  const out: GenerationReference[] = [];

  for (const mention of document.mentions) {
    const slot = pickSlotForMention(mention.ref, slots, counts);
    if (!slot) continue;
    const reference = referenceForMention(mention, slot);
    if (!reference) continue;
    counts.set(slot.slot, (counts.get(slot.slot) ?? 0) + 1);
    out.push({ ...reference, order: out.length });
  }

  return out;
}

export function mergeGenerationReferences(
  explicitRefs: GenerationReference[],
  promptRefs: GenerationReference[],
  slots: GenerationSlotView[] = [],
): GenerationReference[] {
  const out: GenerationReference[] = [];
  const counts = new Map<string, number>();
  const limits = new Map(slots.map((slot) => [slot.slot, slot.max]));
  const allowed = new Set(slots.map((slot) => slot.slot));

  for (const raw of [...explicitRefs, ...promptRefs]) {
    const ref = normalizePublicReference(raw);
    if (!ref) continue;
    if (allowed.size > 0 && !allowed.has(String(ref.slot))) continue;
    if (hasSameReference(out, ref)) continue;
    const limit = limits.get(String(ref.slot));
    if (
      limit !== undefined &&
      (counts.get(String(ref.slot)) ?? 0) + referenceCapacity(ref) > limit
    ) {
      continue;
    }
    pushReference(out, counts, ref);
  }

  return out.map((ref, order) => ({ ...ref, order }));
}

export function cleanMentionLabel(label: string): string {
  return label.replace(/\s+/g, ' ').trim().slice(0, 48) || '未命名';
}

function pickSlotForMention(
  ref: PromptMentionRef,
  slots: GenerationSlotView[],
  counts: Map<string, number>,
): GenerationSlotView | null {
  const preferred = preferredSlots(ref);
  const ordered = [
    ...preferred.flatMap((slotName) => slots.filter((slot) => slot.slot === slotName)),
    ...slots.filter((slot) => !preferred.includes(slot.slot)),
  ];
  return ordered.find((slot) => slotAcceptsMention(slot, ref) && slotHasRoom(slot, counts)) ?? null;
}

function preferredSlots(ref: PromptMentionRef): string[] {
  const out: string[] = [];
  if (ref.slot_hint) out.push(String(ref.slot_hint));
  if (ref.entity_kind && ENTITY_SLOT_BY_KIND[ref.entity_kind])
    out.push(ENTITY_SLOT_BY_KIND[ref.entity_kind]);
  if (ref.asset_type === 'audio') out.push('driving_audio');
  if (ref.asset_type === 'video') out.push('source_video');
  return out;
}

function slotAcceptsMention(slot: GenerationSlotView, ref: PromptMentionRef): boolean {
  if (slot.type === 'entity_ref') return ref.kind === 'entity';
  if (!ref.asset_id && ref.kind !== 'asset') return false;
  const assetType = ref.asset_type ?? outputTypeToAssetType(ref.output_type);
  if (assetType === 'image') return slot.type === 'image' || slot.type === 'image_list';
  if (assetType === 'audio') return slot.type === 'audio';
  if (assetType === 'video') return slot.type === 'video';
  if (assetType === 'json') return slot.type === 'json';
  return false;
}

function referenceForMention(
  mention: PromptMention,
  slot: GenerationSlotView,
): GenerationReference | null {
  const ref = mention.ref;
  if (slot.type === 'entity_ref' && ref.kind === 'entity') {
    if (!ref.asset_id) return null;
    return {
      slot: slot.slot,
      type: 'entity_ref',
      asset_id: ref.asset_id,
      metadata: baseMentionMetadata(mention),
    };
  }
  if (!ref.asset_id) return null;
  return {
    slot: slot.slot,
    type: slot.type as GenerationReferenceType,
    asset_id: ref.asset_id,
    metadata: baseMentionMetadata(mention),
  };
}

function baseMentionMetadata(mention: PromptMention): Record<string, unknown> {
  return {
    source: 'prompt_mention',
    mention_id: mention.id,
    label: mention.label,
    ref_kind: mention.ref.kind,
    entity_kind: mention.ref.entity_kind,
    node_type: mention.ref.node_type,
  };
}

function slotHasRoom(slot: GenerationSlotView, counts: Map<string, number>): boolean {
  return slot.max === undefined || (counts.get(slot.slot) ?? 0) < slot.max;
}

function pushReference(
  out: GenerationReference[],
  counts: Map<string, number>,
  ref: GenerationReference,
): void {
  out.push(ref);
  counts.set(String(ref.slot), (counts.get(String(ref.slot)) ?? 0) + referenceCapacity(ref));
}

function hasSameReference(refs: GenerationReference[], next: GenerationReference): boolean {
  return refs.some((ref) => {
    if (String(ref.slot) !== String(next.slot)) return false;
    const mentionId = ref.metadata?.mention_id;
    if (mentionId && mentionId === next.metadata?.mention_id) return true;
    if (ref.asset_id && ref.asset_id === next.asset_id) return true;
    return Boolean(ref.library_entry_id && ref.library_entry_id === next.library_entry_id);
  });
}

function normalizePublicReference(ref: GenerationReference): GenerationReference | null {
  const assetId = typeof ref.asset_id === 'string' && ref.asset_id.length > 0 ? ref.asset_id : null;
  const libraryId =
    typeof ref.library_entry_id === 'string' && ref.library_entry_id.length > 0
      ? ref.library_entry_id
      : null;
  if (Number(Boolean(assetId)) + Number(Boolean(libraryId)) !== 1) return null;
  if (libraryId) {
    return {
      ...ref,
      type: 'library_ref',
      asset_id: undefined,
      library_entry_id: libraryId,
    } as GenerationReference;
  }
  if (ref.type === 'library_ref') return null;
  return { ...ref, asset_id: assetId!, library_entry_id: undefined } as GenerationReference;
}

function uniqueByToken(mentions: PromptMention[]): PromptMention[] {
  const byToken = new Map<string, PromptMention>();
  for (const mention of mentions) {
    if (!mention.token) continue;
    byToken.set(mention.token, mention);
  }
  return Array.from(byToken.values());
}

function findTokenPositions(text: string, mention: PromptMention) {
  const positions: { start: number; end: number; mention: PromptMention }[] = [];
  let offset = 0;
  while (offset < text.length) {
    const start = text.indexOf(mention.token, offset);
    if (start === -1) break;
    positions.push({ start, end: start + mention.token.length, mention });
    offset = start + mention.token.length;
  }
  return positions;
}

function outputTypeToAssetType(
  type: PromptMentionRef['output_type'],
): PromptMentionRef['asset_type'] | undefined {
  if (type === 'image' || type === 'image_list' || type === 'mask') return 'image';
  if (type === 'audio') return 'audio';
  if (type === 'video') return 'video';
  if (type === 'json') return 'json';
  return undefined;
}

function shortId(id: string): string {
  return id ? ` ${id.slice(0, 6)}` : '';
}
