import * as fs from 'node:fs/promises';
import { canonicalJson, sha256Hex } from './canonical';
import type { CatalogCompilation } from './types';
import { assertValidCatalogBundle } from './validator';
import { assertCatalogRuntimeCompatibility } from './runtime-version';

export async function loadCatalogBundle(
  filePath: string,
  knownAdapterKeys?: ReadonlySet<string>,
  adapterTaskTypes?: ReadonlyMap<string, readonly string[]>,
): Promise<CatalogCompilation> {
  const text = await fs.readFile(filePath, 'utf8');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`${filePath}: invalid Catalog Bundle JSON: ${(error as Error).message}`);
  }
  const bundle = assertValidCatalogBundle(raw, knownAdapterKeys, adapterTaskTypes);
  assertCatalogRuntimeCompatibility(bundle);
  const serialized = canonicalJson(bundle);
  return { bundle, canonical_json: serialized, content_digest: sha256Hex(serialized) };
}
