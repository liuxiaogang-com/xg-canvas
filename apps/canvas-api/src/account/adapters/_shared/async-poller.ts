/**
 * Helpers shared by async adapters. The actual poll loop lives in
 * InvokeService — adapters only implement `poll()` and return PollResult.
 *
 * This module just clamps next-poll cadence into a sensible range.
 */

const MIN_POLL_MS = 500;
const MAX_POLL_MS = 30_000;

export function clampPollDelay(ms: number | undefined, fallback = 2000): number {
  const v = ms ?? fallback;
  return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, v));
}

export interface PollPolicy {
  initial_delay_ms: number;
  interval_ms: number;
  max_total_ms: number;
}

export const DEFAULT_POLL_POLICY: PollPolicy = {
  initial_delay_ms: 1000,
  interval_ms: 2000,
  max_total_ms: 600_000,
};
