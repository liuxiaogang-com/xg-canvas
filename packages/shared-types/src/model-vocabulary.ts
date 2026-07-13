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
 * so the two layers can never drift. Legacy/ergonomic aliases are accepted on
 * input and canonicalised; truly unknown values are rejected by the validator.
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

/**
 * Ergonomic / legacy aliases accepted on YAML input and folded to the canonical
 * TaskType. Lets a manifest say the readable `text_generation` or the canonical
 * `gen.text`; both resolve to `gen.text`. The conflated `text_multimodal` /
 * `structured_output` map to the underlying task type — they should ALSO be
 * declared as capabilities (vision / structured_output).
 */
export const TASK_TYPE_ALIASES: Readonly<Record<string, TaskType>> = {
  text_generation: 'gen.text',
  text_multimodal: 'gen.text',
  structured_output: 'gen.text',
  image_generation: 'gen.image',
  video_generation: 'gen.video',
  audio_generation: 'gen.audio',
};

/** Capability aliases (e.g. OpenAI's `function_call` -> our `tool_use`). */
export const CAPABILITY_ALIASES: Readonly<Record<string, Capability>> = {
  function_call: 'tool_use',
  function_calling: 'tool_use',
  json: 'json_mode',
};

const TASK_TYPE_SET: ReadonlySet<string> = new Set(TASK_TYPES);
const CAPABILITY_SET: ReadonlySet<string> = new Set(CAPABILITIES);

export function canonicaliseTaskType(raw: string): string {
  return TASK_TYPE_ALIASES[raw] ?? raw;
}

export function canonicaliseCapability(raw: string): string {
  return CAPABILITY_ALIASES[raw] ?? raw;
}

export function isTaskType(s: string): s is TaskType {
  return TASK_TYPE_SET.has(s);
}

export function isCapability(s: string): s is Capability {
  return CAPABILITY_SET.has(s);
}
