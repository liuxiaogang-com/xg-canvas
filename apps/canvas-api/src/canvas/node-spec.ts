/**
 * Node port specs — single source of truth for the BACKEND validator.
 * Keeps connection-validator independent of the front-end registry.
 *
 * Mirrors docs/node-spec.md §3 (M3 nodes only). M4 entity nodes are
 * added when M4 lands.
 */

import type { EntityRefKind, IOType } from '@xgcanvas/shared-types';

export interface PortSpec {
  id: string;
  type: IOType;
  entityKind?: EntityRefKind;
  optional?: boolean;
}

export interface NodeSpec {
  type: string;
  inputs: PortSpec[];
  outputs: PortSpec[];
}

const NODE_SPECS: Record<string, NodeSpec> = {
  asset_input: {
    type: 'asset_input',
    inputs: [],
    // Dynamic media type on the frontend; backend lists all three so
    // connection-validator can match the edge data_type to a source port.
    outputs: [
      { id: 'image', type: 'image' },
      { id: 'video', type: 'video' },
      { id: 'audio', type: 'audio' },
    ],
  },
  gen_text: {
    type: 'gen_text',
    inputs: [
      { id: 'prompt', type: 'text', optional: true },
      { id: 'system', type: 'json', optional: true },
    ],
    outputs: [{ id: 'out', type: 'text' }],
  },
  gen_image: {
    type: 'gen_image',
    inputs: [
      { id: 'prompt', type: 'text', optional: true },
      { id: 'reference', type: 'image_list', optional: true },
      { id: 'mask', type: 'mask', optional: true },
      { id: 'style', type: 'style_token', optional: true },
    ],
    outputs: [{ id: 'out', type: 'image' }],
  },
  gen_video: {
    type: 'gen_video',
    inputs: [
      { id: 'prompt', type: 'text', optional: true },
      { id: 'reference', type: 'image_list', optional: true },
      { id: 'audio_ref', type: 'audio', optional: true },
      { id: 'storyboard', type: 'entity_ref', entityKind: 'storyboard', optional: true },
    ],
    outputs: [{ id: 'out', type: 'video' }],
  },
  gen_audio: {
    type: 'gen_audio',
    inputs: [{ id: 'prompt', type: 'text', optional: true }],
    outputs: [{ id: 'out', type: 'audio' }],
  },

  // ---------- M4 ----------
  script_input: {
    type: 'script_input',
    inputs: [
      { id: 'in_text', type: 'text', optional: true },
      { id: 'in_json', type: 'json', optional: true },
    ],
    outputs: [
      { id: 'out_text', type: 'text' },
      { id: 'out_json', type: 'json' },
    ],
  },
  entity_character: {
    type: 'entity_character',
    inputs: [{ id: 'reference', type: 'image_list', optional: true }],
    outputs: [
      { id: 'ref', type: 'entity_ref', entityKind: 'character' },
      { id: 'image', type: 'image' },
    ],
  },
  entity_scene: {
    type: 'entity_scene',
    inputs: [{ id: 'reference', type: 'image_list', optional: true }],
    outputs: [
      { id: 'ref', type: 'entity_ref', entityKind: 'scene' },
      { id: 'image', type: 'image' },
    ],
  },
  entity_prop: {
    type: 'entity_prop',
    inputs: [{ id: 'reference', type: 'image_list', optional: true }],
    outputs: [
      { id: 'ref', type: 'entity_ref', entityKind: 'prop' },
      { id: 'image', type: 'image' },
    ],
  },
  storyboard_shot: {
    type: 'storyboard_shot',
    inputs: [
      { id: 'characters', type: 'entity_ref', entityKind: 'character', optional: true },
      { id: 'scene', type: 'entity_ref', entityKind: 'scene', optional: true },
      { id: 'props', type: 'entity_ref', entityKind: 'prop', optional: true },
      { id: 'reference', type: 'image_list', optional: true },
    ],
    outputs: [
      { id: 'storyboard_ref', type: 'entity_ref', entityKind: 'storyboard' },
      { id: 'image', type: 'image', optional: true },
      { id: 'video', type: 'video', optional: true },
    ],
  },
  grid: {
    type: 'grid',
    inputs: [{ id: 'in', type: 'image_list' }],
    outputs: [
      { id: 'out_grid', type: 'grid' },
      { id: 'out_list', type: 'image_list' },
    ],
  },
};

export function getNodeSpec(type: string): NodeSpec {
  const s = NODE_SPECS[type];
  if (!s) {
    return {
      type,
      inputs: [],
      outputs: [],
    };
  }
  return s;
}

export function listNodeSpecs(): readonly NodeSpec[] {
  return Object.values(NODE_SPECS);
}
