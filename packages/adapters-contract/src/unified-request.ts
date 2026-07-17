/**
 * UnifiedRequest - what InvokeService passes to a ProviderAdapter.
 * Spec: docs/adapter-guide.md, docs/task-lifecycle.md.
 *
 * Adapters translate this into vendor-specific HTTP / CLI calls.
 * The shape is intentionally task-type aware: an adapter looks at
 * `task_type` to know which optional fields to expect.
 */

import type {
  GenerationInput,
  ResolvedGenerationReference,
  TaskType,
} from '@xgcanvas/shared-types';

export interface UnifiedRequest {
  task_type: TaskType;
  /** Stable public model_id from the pinned Catalog Model Revision. */
  model_id: string;
  /** Provider-side identifier (e.g. "gpt-4o", "deepseek-chat"). */
  provider_model: string;
  /** Validated + constraint-resolved params, ready for vendor mapping. */
  params: Record<string, unknown>;
  /** Inputs already resolved by canvas-api: prompts, reference urls, etc. */
  inputs: UnifiedInputs;
  /** Streaming requested. Adapters that do not support it ignore this. */
  stream?: boolean;
  /** Idempotency key, optional but recommended for vendor retries. */
  idempotency_key?: string;
}

/**
 * Common multimodal inputs. Adapters read only the fields they need.
 * URLs must be HTTPS-resolvable from the adapter: presigned object-storage
 * URLs for our own assets, or vendor CDN URLs only when reusing the same vendor.
 */
export interface UnifiedInputs {
  /** Canonical generation mode, e.g. text_to_image / first_last_frame. */
  mode?: GenerationInput['mode'];
  prompt?: string;
  negative_prompt?: string;
  system_prompt?: string;
  /** Conversation history for chat-style models. */
  messages?: ChatMessage[];
  /** Canonical multimodal references. Asset ids are resolved to URLs before invoke. */
  references?: ResolvedGenerationReference[];
  /** Single mask, when task_type is image.edit / outpaint. */
  mask_url?: string;
  /** Free-form structured payload (script JSON, storyboard rows, ...). */
  json?: unknown;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ChatContentPart[];
  name?: string;
  tool_call_id?: string;
}

export interface ChatContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}
