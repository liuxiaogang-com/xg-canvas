import { describe, expect, it } from 'vitest';
import type { CatalogBundleV1 } from './types';
import { assertCatalogRuntimeCompatibility, compareNumericSemver } from './runtime-version';

describe('Catalog runtime version gate', () => {
  it('compares numeric semantic versions', () => {
    expect(compareNumericSemver('0.10.0', '0.2.0')).toBeGreaterThan(0);
    expect(compareNumericSemver('1.0.0', '1.0.0')).toBe(0);
  });

  it('rejects a bundle requiring a newer runtime', () => {
    const bundle = {
      release: { release_id: 'release', min_runtime_version: '2.0.0' },
    } as CatalogBundleV1;
    expect(() => assertCatalogRuntimeCompatibility(bundle, '1.9.9'))
      .toThrow('requires runtime >= 2.0.0');
  });
});
