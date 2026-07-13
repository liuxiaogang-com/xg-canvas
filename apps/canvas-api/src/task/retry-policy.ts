/**
 * Retry policy. The set of retryable error codes is intentionally small —
 * vendor-side rate limiting, timeouts, or our own asset download / storage
 * blips. Anything else surfaces immediately.
 */

import { ERROR_CODES, isRetryable, type ErrorCode } from '@xgcanvas/shared-types';

export interface RetryDecision {
  retry: boolean;
  /** Wait this long before re-queueing. */
  delay_ms: number;
  /** Final attempt count cap. */
  max_attempts: number;
}

const MAX_ATTEMPTS = 3;

export function decideRetry(errorCode: ErrorCode | string, currentAttempts: number): RetryDecision {
  const known = (errorCode as ErrorCode) in ERROR_CODES ? (errorCode as ErrorCode) : null;
  const can = known ? isRetryable(known) : false;
  if (!can || currentAttempts >= MAX_ATTEMPTS) {
    return { retry: false, delay_ms: 0, max_attempts: MAX_ATTEMPTS };
  }
  // exponential backoff: 2s, 8s, 30s
  const delay = Math.min(30_000, 2_000 * 4 ** currentAttempts);
  return { retry: true, delay_ms: delay, max_attempts: MAX_ATTEMPTS };
}
