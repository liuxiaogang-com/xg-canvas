/**
 * Result of an async adapter's poll() call.
 * The InvokeService loop translates this into a task row update.
 */

import type { UnifiedResponse } from './unified-response';

export interface PollResult {
  /** Reuses UnifiedResponse so the merge into the task row is symmetrical. */
  response: UnifiedResponse;
  /** Override poll cadence for the next round; ms. */
  next_poll_after_ms?: number;
}
