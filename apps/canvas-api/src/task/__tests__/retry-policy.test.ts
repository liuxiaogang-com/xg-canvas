import { ERROR_CODES } from '@xgcanvas/shared-types';

import { decideRetry } from '../retry-policy';

describe('decideRetry', () => {
  it('retries on rate limit with backoff', () => {
    const d = decideRetry(ERROR_CODES.RATE_LIMITED, 0);
    expect(d.retry).toBe(true);
    expect(d.delay_ms).toBeGreaterThanOrEqual(2_000);
  });

  it('does not retry constraint violations', () => {
    expect(decideRetry(ERROR_CODES.CONSTRAINT_VIOLATION, 0).retry).toBe(false);
  });

  it('stops at max_attempts', () => {
    expect(decideRetry(ERROR_CODES.RATE_LIMITED, 3).retry).toBe(false);
  });

  it('exponential backoff capped', () => {
    const d = decideRetry(ERROR_CODES.RATE_LIMITED, 2);
    expect(d.delay_ms).toBeLessThanOrEqual(30_000);
  });
});
