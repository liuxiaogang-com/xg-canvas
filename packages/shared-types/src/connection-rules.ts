/**
 * React Flow `isValidConnection` table.
 * Spec: docs/node-spec.md §2.
 *
 * The rule set is intentionally small: an edge is valid iff a matching
 * (source_io, target_io) pair appears below. `entity_ref` is matched on
 * the optional `kind` (character / scene / prop / storyboard).
 */

import type { EntityRefKind, IOType } from './io-types';

export interface PortRef {
  io: IOType;
  /** Only meaningful when io === 'entity_ref'. */
  entityKind?: EntityRefKind;
}

interface Rule {
  source: PortRef;
  target: PortRef;
}

/**
 * Direct compatibility list. Bidirectional connections are NOT allowed
 * unless declared in both directions (intentional).
 */
const RULES: readonly Rule[] = [
  // text → any prompt-accepting node (handled via `target.io === 'text'`)
  { source: { io: 'text' }, target: { io: 'text' } },
  // image / image_list → reference inputs (typed as image / image_list)
  { source: { io: 'image' }, target: { io: 'image' } },
  { source: { io: 'image' }, target: { io: 'image_list' } },
  { source: { io: 'image_list' }, target: { io: 'image_list' } },
  // grid → batch image consumers
  { source: { io: 'grid' }, target: { io: 'image_list' } },
  { source: { io: 'grid' }, target: { io: 'image' } },
  // image_list → grid (compose)
  { source: { io: 'image_list' }, target: { io: 'grid' } },
  // audio → audio reference
  { source: { io: 'audio' }, target: { io: 'audio' } },
  // mask / style_token to their dedicated ports
  { source: { io: 'mask' }, target: { io: 'mask' } },
  { source: { io: 'style_token' }, target: { io: 'style_token' } },
  // json → script / storyboard import
  { source: { io: 'json' }, target: { io: 'json' } },
  // entity_ref<X> → entity_ref<X>
  { source: { io: 'entity_ref', entityKind: 'character' }, target: { io: 'entity_ref', entityKind: 'character' } },
  { source: { io: 'entity_ref', entityKind: 'scene' }, target: { io: 'entity_ref', entityKind: 'scene' } },
  { source: { io: 'entity_ref', entityKind: 'prop' }, target: { io: 'entity_ref', entityKind: 'prop' } },
  { source: { io: 'entity_ref', entityKind: 'storyboard' }, target: { io: 'entity_ref', entityKind: 'storyboard' } },
  // storyboard ref also feeds image / video nodes (re-render from a shot)
  { source: { io: 'entity_ref', entityKind: 'storyboard' }, target: { io: 'image' } },
  { source: { io: 'entity_ref', entityKind: 'storyboard' }, target: { io: 'video' } },
  // entity character image output is an `image` (already covered by image→image)
  // video output never feeds back into text — explicitly omitted.
];

function portMatches(a: PortRef, b: PortRef): boolean {
  if (a.io !== b.io) return false;
  if (a.io === 'entity_ref') return a.entityKind === b.entityKind;
  return true;
}

export function isConnectionAllowed(source: PortRef, target: PortRef): boolean {
  return RULES.some(
    (r) => portMatches(r.source, source) && portMatches(r.target, target),
  );
}

export const CONNECTION_RULES: readonly Rule[] = RULES;
