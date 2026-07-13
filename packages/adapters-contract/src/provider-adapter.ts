/**
 * ProviderAdapter — the interface every vendor integration implements.
 * Spec: docs/adapter-guide.md, docs/overview.md §3.
 *
 * Code-first: the adapter owns translation logic. Model-specific
 * parameters live in YAML manifests and are validated by InvokeService
 * BEFORE invoke() is called, so the adapter can trust `req.params`.
 */

import type { TaskType } from '@xgcanvas/shared-types';
import type { InvokeCtx } from './invoke-context';
import type { PollResult } from './poll-result';
import type { UnifiedRequest } from './unified-request';
import type { UnifiedResponse } from './unified-response';

export type InvocationMode = 'sync' | 'async' | 'stream';

export interface ProviderAdapter {
  /** Stable identifier, e.g. "openai-compat", "doubao-image". */
  readonly key: string;
  /** Task types this adapter can serve. */
  readonly capabilities: readonly TaskType[];
  /** Primary mode — async adapters MUST also implement poll(). */
  readonly invocationMode: InvocationMode;

  invoke(req: UnifiedRequest, ctx: InvokeCtx): Promise<UnifiedResponse>;
  poll?(externalTaskId: string, ctx: InvokeCtx): Promise<PollResult>;
  cancel?(externalTaskId: string, ctx: InvokeCtx): Promise<void>;
  stream?(req: UnifiedRequest, ctx: InvokeCtx): AsyncIterable<StreamChunk>;
}

export interface StreamChunk {
  /** Incremental text delta for chat-style responses. */
  text_delta?: string;
  /** Incremental reasoning/chain-of-thought delta (reasoner models). */
  reasoning_delta?: string;
  /** Vendor-reported progress 0..1. */
  progress?: number;
  /** Final-only payload — emitted as the last chunk. */
  done?: UnifiedResponse;
}

/**
 * Factory shape used by the adapter registry — each adapter exports one.
 * Keeping construction lazy means the registry can short-circuit when a
 * provider has no enabled credentials.
 */
export type ProviderAdapterFactory = () => ProviderAdapter;
