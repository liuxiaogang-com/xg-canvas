import type { Edge, Node } from '@xyflow/react';
import type { GenerationReference, GenerationReferenceType } from '@xgcanvas/shared-types';

import type { CanvasNodeData, UpstreamInputs } from '../nodes/types';

export interface ResolveUpstreamOptions {
  /**
   * When set, only inbound media edges whose type matches one of these are
   * collected as references. Text edges are always accepted for prompt.
   * Passing the current node's active slot types keeps upstream media aligned
   * with the selected mode even after the node type/mode changes.
   */
  acceptTypes?: GenerationReferenceType[];
}

/**
 * For a target node, walk every incoming edge and pull the producing node's
 * output into UpstreamInputs. With the single-port model the role is inferred
 * from the EDGE data_type (= the source's output type), not the target handle.
 * Direct-only (no recursive traversal) — nodes already have output_text /
 * output_asset_id stamped after their last run.
 */
export function resolveUpstream(
  targetNodeId: string,
  nodes: Node<CanvasNodeData>[],
  edges: Edge[],
  opts: ResolveUpstreamOptions = {},
): UpstreamInputs {
  const inbound = edges.filter((e) => e.target === targetNodeId);
  const out: UpstreamInputs = {};
  const refs: GenerationReference[] = [];
  const accept = opts.acceptTypes;

  for (const e of inbound) {
    const src = nodes.find((n) => n.id === e.source);
    if (!src) continue;
    const data = src.data as CanvasNodeData;
    const base = String((e.data as { data_type?: string } | undefined)?.data_type ?? '').split(':')[0];

    if (base === 'text' && typeof data.output_text === 'string') {
      out.prompt = data.output_text;
      continue;
    }

    if (typeof data.output_asset_id !== 'string') continue;

    if (base === 'image' || base === 'image_list' || base === 'grid') {
      const type = toReferenceType(base);
      if (accept && !accept.some((t) => matchesAccept(type, t))) continue;
      refs.push({
        slot: 'reference_image',
        type,
        asset_id: data.output_asset_id,
        order: refs.length,
      });
    } else if (base === 'video') {
      if (accept && !accept.some((t) => matchesAccept('video', t))) continue;
      refs.push({
        slot: 'source_video',
        type: 'video',
        asset_id: data.output_asset_id,
        order: refs.length,
      });
    } else if (base === 'audio') {
      if (accept && !accept.some((t) => matchesAccept('audio', t))) continue;
      refs.push({
        slot: 'driving_audio',
        type: 'audio',
        asset_id: data.output_asset_id,
        order: refs.length,
      });
    } else if (base === 'mask') {
      if (accept && !accept.some((t) => matchesAccept('mask', t))) continue;
      refs.push({
        slot: 'mask',
        type: 'mask',
        asset_id: data.output_asset_id,
        order: refs.length,
      });
    }
  }

  if (refs.length > 0) out.references = refs;
  return out;
}

/** Derive acceptTypes from a node's form.referenceSlots (fallback schema). */
export function acceptTypesFromSlots(
  slots: Array<{ type?: GenerationReferenceType; accept?: string }> | undefined,
): GenerationReferenceType[] | undefined {
  if (!slots?.length) return undefined;
  const types = slots.map((slot) => slot.type ?? acceptToReferenceType(slot.accept ?? ''));
  return types.length ? types : undefined;
}

function matchesAccept(actual: GenerationReferenceType, expected: GenerationReferenceType): boolean {
  if (expected === 'image' || expected === 'image_list') {
    return actual === 'image' || actual === 'image_list';
  }
  return actual === expected;
}

function toReferenceType(base: string): GenerationReferenceType {
  if (base === 'video') return 'video';
  if (base === 'audio') return 'audio';
  if (base === 'mask') return 'mask';
  if (base === 'grid' || base === 'image_list') return 'image_list';
  return 'image';
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
