/**
 * Canonical model vocabulary — the single source of truth for the two closed
 * vocabularies a model manifest declares:
 *
 *   - task_types  : which TaskType node/pipeline slot a model serves
 *                   (gen.text / gen.image / ...). Defined in ./task.ts.
 *   - capabilities: feature flags that gate UI controls, request building and
 *                   constraint-engine rules (json_mode / tool_use / vision ...).
 *
 * Both the YAML manifest validator and the in-memory registry import from here
 * so the two layers can never drift. Authoring input must use these canonical
 * values directly; unknown and legacy aliases are rejected.
 *
 * Spec: docs/adapter-guide.md (§ 模型词表).
 */

import { TASK_TYPES, type TaskType } from './task';

/** Closed capability vocabulary. Add new flags here, never inline a raw string. */
export const CAPABILITIES = [
  // text / agent feature gates
  'text_chat',
  'vision',
  'json_mode', // guarantees valid JSON, not schema adherence
  'structured_output', // native json-schema / strict structured output
  'tool_use', // function / tool calling
  'streaming',
  'reasoning',
  'embeddings',
  // image
  'image_gen',
  'image_ref', // image-to-image / reference image
  // video
  'video_gen',
  'first_last_frame',
  'multi_reference',
  // audio
  'audio_gen',
  'tts',
  'asr',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const TASK_TYPE_SET: ReadonlySet<string> = new Set(TASK_TYPES);
const CAPABILITY_SET: ReadonlySet<string> = new Set(CAPABILITIES);

export function isTaskType(s: string): s is TaskType {
  return TASK_TYPE_SET.has(s);
}

export function isCapability(s: string): s is Capability {
  return CAPABILITY_SET.has(s);
}
