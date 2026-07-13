import { genOpaqueToken, sha256, toHex } from './session.tokens';

describe('session.tokens', () => {
  it('mints a URL-safe opaque token with no dots', () => {
    const t = genOpaqueToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t).not.toContain('.');
    expect(t.length).toBeGreaterThanOrEqual(43);
  });

  it('hashes deterministically to 64 hex chars', () => {
    expect(toHex(sha256('hello'))).toBe(toHex(sha256('hello')));
    expect(toHex(sha256('x'))).toHaveLength(64);
    expect(toHex(sha256('a'))).not.toBe(toHex(sha256('b')));
  });
});
