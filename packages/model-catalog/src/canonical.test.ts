import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Hex } from './canonical';

describe('canonicalJson', () => {
  it('sorts object keys recursively while preserving array order', () => {
    const a = { z: 1, nested: { b: 2, a: 1 }, list: [{ y: 2, x: 1 }, 3] };
    const b = { list: [{ x: 1, y: 2 }, 3], nested: { a: 1, b: 2 }, z: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"list":[{"x":1,"y":2},3],"nested":{"a":1,"b":2},"z":1}');
  });

  it('produces a stable sha256 digest', () => {
    expect(sha256Hex(canonicalJson({ b: 2, a: 1 }))).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(canonicalJson({ b: 2, a: 1 }))).toBe(
      sha256Hex(canonicalJson({ a: 1, b: 2 })),
    );
  });

  it('rejects values that JSON would silently coerce or omit', () => {
    expect(() => canonicalJson({ value: Number.POSITIVE_INFINITY })).toThrow(
      'must be a finite JSON number',
    );
    expect(() => canonicalJson({ value: Number.NaN })).toThrow('must be a finite JSON number');
    expect(() => canonicalJson([undefined])).toThrow('contains a non-JSON value');
    expect(() => canonicalJson({ value: new Date() })).toThrow('must be a plain JSON object');
  });

  it('rejects circular structures', () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(() => canonicalJson(value)).toThrow('contains a circular reference');
  });
});
