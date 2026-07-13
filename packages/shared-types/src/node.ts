/**
 * Node schema types — what a node "is" on the canvas.
 * Spec: docs/node-spec.md (especially §4 v0.3 layout and §6 schema example).
 *
 * `defineNodeSchema()` is a typed pass-through used by per-node `schema.ts`
 * files in apps/canvas-web/src/nodes/<type>/.
 */

import type { EntityRefKind, IOType } from './io-types';
import type { TaskType } from './task';

/**
 * Node category — drives palette grouping in the "+" picker.
 */
export const NODE_CATEGORIES = [
  'input',     // script_input
  'entity',    // character / scene / prop
  'generation',// gen_text / gen_image / gen_video / gen_audio
  'compose',   // grid / storyboard_shot
  'view',      // storyboard_table_view / task_queue_view
] as const;
export type NodeCategory = (typeof NODE_CATEGORIES)[number];

/**
 * A port. `type: 'entity_ref'` may pin an `entityKind` so connection
 * validation can distinguish character/scene/prop/storyboard.
 */
export interface Port {
  id: string;
  type: IOType;
  /** Required for entity_ref ports; ignored otherwise. */
  entityKind?: EntityRefKind;
  /** Optional label shown next to the port handle. */
  label?: string;
  /** Optional cardinality cap on inputs (e.g. reference up to 4). */
  max?: number;
  optional?: boolean;
}

export interface NodePorts {
  inputs: Port[];
  outputs: Port[];
}

/**
 * Layout zones for a node's inner stack (top to bottom, v0.3).
 * Each value is the id of a part component registered in the node's
 * `parts/` directory. Empty arrays are allowed.
 */
export interface NodeLayout {
  /** Floating chip strip above the media — usually status / model name. */
  toolbar?: string[];
  params_top?: string[];
  params_center?: string[];
  params_bottom?: string[];
}

/**
 * One bottom-pill chip: a quick action exposed when this node is selected.
 * Maps to a `actions/<id>.ts` file inside the node directory.
 */
export interface PillAction {
  id: string;
  label: string;
  /** Task type this chip submits, when the chip directly fires a task. */
  task_type?: TaskType;
  icon?: string;
  /** Optional sub-popover spec (more params before submission). */
  popover?: 'model_picker' | 'params_more' | 'custom';
}

/**
 * The Agent panel on the right — selecting this node prefills these.
 */
export interface AgentBindings {
  suggestions: string[];
  /** Function name resolved at runtime; we only carry the identifier here. */
  contextTemplateId?: string;
}

export interface NodeSchema<DefaultData = Record<string, unknown>> {
  type: string;
  category: NodeCategory;
  ports: NodePorts;
  layout: NodeLayout;
  pillActions: PillAction[];
  agent: AgentBindings;
  /** Initial data block when the node is dropped on the canvas. */
  defaultData: DefaultData;
}

export function defineNodeSchema<D extends Record<string, unknown>>(
  schema: NodeSchema<D>,
): NodeSchema<D> {
  return schema;
}
