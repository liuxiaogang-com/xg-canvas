import { sessionTtlMs } from './session-lifetime';

describe('sessionTtlMs', () => {
  it('uses the same configured lifetime for server sessions and cookies', () => {
    expect(sessionTtlMs('7')).toBe(7 * 86_400_000);
  });

  it.each([undefined, '', '0', '-1', 'invalid'])('falls back to 30 days for %p', (value) => {
    expect(sessionTtlMs(value)).toBe(30 * 86_400_000);
  });
});
