import type { CatalogBundleV1 } from './types';

/** Bump when this runtime adopts a new Bundle semantic contract. */
export const MODEL_CATALOG_RUNTIME_VERSION = '0.1.0';

export function assertCatalogRuntimeCompatibility(
  bundle: CatalogBundleV1,
  runtimeVersion = MODEL_CATALOG_RUNTIME_VERSION,
): void {
  const minimum = bundle.release.min_runtime_version;
  if (!minimum) return;
  if (compareNumericSemver(runtimeVersion, minimum) < 0) {
    throw new Error(
      `Catalog release ${bundle.release.release_id} requires runtime >= ${minimum}; ` +
      `current runtime is ${runtimeVersion}`,
    );
  }
}

export function compareNumericSemver(left: string, right: string): number {
  const a = parseNumericSemver(left);
  const b = parseNumericSemver(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

function parseNumericSemver(value: string): [number, number, number] {
  if (!/^\d+\.\d+\.\d+$/.test(value)) {
    throw new Error(`invalid numeric semantic version: ${value}`);
  }
  return value.split('.').map(Number) as [number, number, number];
}
