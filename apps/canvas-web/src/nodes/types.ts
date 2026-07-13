import type { NodeStatus } from '@xgcanvas/ui-kit';
import type { GenerationReference, GenerationReferenceSlot, GenerationReferenceType } from '@xgcanvas/shared-types';

export interface NodePortDef {
  id: string;
  type: string; // IOType
  entityKind?: string;
  label?: string;
  required?: boolean;
}

export interface PillActionDef {
  id: string;
  label: string;
  task_type?: string;
  icon?: string;
}

/** v0.4 inline node-form descriptor (LibTV paradigm). Drives NodeInlineForm.
 *  Param CONTROLS are not declared here — they are derived at runtime from the
 *  selected model's param_schema (GET /models/schema). This spec only declares
 *  the structural slots: modes, reference slots, prompt, model field, cost. */
export interface FormModeDef {
  id: string;
  label: string;
  /** input port ids this mode requires (drives the active reference slots). */
  requires?: string[];
}

export interface FormReferenceSlot {
  /** input port id this slot maps to. */
  port: string;
  /** Canonical generation input slot written to inputs.references[].slot. */
  slot?: GenerationReferenceSlot | string;
  label: string;
  /** IOType accepted, for the hint. */
  accept: string;
  type?: GenerationReferenceType;
  advanced?: boolean;
}

export interface NodeFormSpec {
  /** task_type for modelApi.list + cost estimate. */
  taskType: string;
  modes?: FormModeDef[];
  /** node.data field holding the selected mode id. Default 'mode'. */
  modeField?: string;
  referenceSlots?: FormReferenceSlot[];
  prompt?: { field: string; placeholder?: string; mention?: boolean };
  /** node.data field holding the chosen model id. Default 'model_id'. */
  modelField?: string;
  /** show a live credit-cost badge next to the generate button. */
  cost?: boolean;
  submit: { label: string };
}

/** Mirrors apps/canvas-api/src/canvas/node-spec.ts but adds UX-only fields. */
export interface NodeSchema<DefaultData = Record<string, unknown>> {
  type: string;
  title: string;
  category: 'generation' | 'entity' | 'compose' | 'input' | 'view';
  inputs: NodePortDef[];
  outputs: NodePortDef[];
  defaultData: DefaultData;
  /** v0.4 inline node form (generation nodes). Absent = no inline form. */
  form?: NodeFormSpec;
  /** Pill chips shown when this node is selected (also the node-top toolbar). */
  pillActions: PillActionDef[];
  /** Agent panel suggestion chips. */
  agentSuggestions: string[];
  /** Build a system-prompt context string for Agent. */
  agentContext(data: DefaultData): string;
  /** Map node + upstream into task params/inputs at submission time. */
  buildTaskBody(data: DefaultData, upstream: UpstreamInputs): TaskBody;
}

export interface UpstreamInputs {
  prompt?: string;
  references?: GenerationReference[];
}

export interface TaskBody {
  task_type: string;
  model_id: string;
  params: Record<string, unknown>;
  inputs: Record<string, unknown>;
}

/** Status overlay used by the node shell. Includes the canvas-api 'pending'
 *  status as an alias of 'queued' for UI purposes. */
export type CanvasNodeStatus = NodeStatus | 'pending';

export interface CanvasNodeData {
  /** Persisted node data — node-type specific. */
  [key: string]: unknown;
  /** Custom node title (persisted). When set, overrides the schema title. */
  title?: string;
  /** UX overlay state, NOT persisted (transient overlay added by store). */
  status?: CanvasNodeStatus;
  task_id?: string;
  output_asset_id?: string;
  output_text?: string;
}

export function toShellStatus(s: CanvasNodeStatus | undefined): NodeStatus {
  return s === 'pending' ? 'queued' : s ?? 'idle';
}
