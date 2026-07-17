import {
  CatalogModelOfferingSchema,
  CatalogRateCardSchema,
  canonicalJson,
  sha256Hex,
  type CatalogChannelTemplate,
  type CatalogModelOffering,
  type CatalogProvider,
  type CatalogRateCard,
} from '@xgcanvas/model-catalog';
import { assertCatalogVisibility, type TaskType } from '@xgcanvas/shared-types';
import type { CatalogRecord } from '../catalog/catalog-read.service';
import type { ModelRegistryEntry } from './types';

export interface RevisionRow {
  revision_id: string;
  source_id: string;
  source_kind: 'official' | 'local';
  release_id: string | null;
  content_digest: string;
  document: unknown;
}

export function withEpoch(entry: ModelRegistryEntry, catalogEpoch: string): ModelRegistryEntry {
  return { ...entry, pin: { ...entry.pin, catalog_epoch: catalogEpoch } };
}

export function parseModel(row: RevisionRow): CatalogModelOffering {
  assertRevisionDigest(row);
  const parsed = CatalogModelOfferingSchema.safeParse(row.document);
  if (!parsed.success) {
    throw new Error(
      `invalid stored model revision ${row.revision_id}: ` +
        parsed.error.errors.map((error) => error.message).join('; '),
    );
  }
  return parsed.data as CatalogModelOffering;
}

export function parseRate(row: RevisionRow): CatalogRateCard {
  assertRevisionDigest(row);
  const parsed = CatalogRateCardSchema.safeParse(row.document);
  if (!parsed.success) {
    throw new Error(
      `invalid stored Rate Card revision ${row.revision_id}: ` +
        parsed.error.errors.map((error) => error.message).join('; '),
    );
  }
  return parsed.data as CatalogRateCard;
}

function assertRevisionDigest(row: RevisionRow): void {
  const actual = sha256Hex(canonicalJson(row.document));
  if (actual !== row.content_digest) {
    throw new Error(`Catalog revision content digest mismatch: ${row.revision_id}`);
  }
}

export function buildIndexes(entries: Iterable<ModelRegistryEntry>): {
  byTaskType: Map<TaskType, ModelRegistryEntry[]>;
  byProvider: Map<string, ModelRegistryEntry[]>;
} {
  const byTaskType = new Map<TaskType, ModelRegistryEntry[]>();
  const byProvider = new Map<string, ModelRegistryEntry[]>();
  for (const entry of entries) {
    for (const taskType of entry.manifest.task_types) {
      byTaskType.set(taskType, [...(byTaskType.get(taskType) ?? []), entry]);
    }
    const provider = entry.manifest.provider_key;
    byProvider.set(provider, [...(byProvider.get(provider) ?? []), entry]);
  }
  return { byTaskType, byProvider };
}

export function snapshotDigest(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

export function asVisibility(value: string): 'public' | 'internal' | 'hidden' {
  return assertCatalogVisibility(value);
}

export function recordsOfKind<
  T extends CatalogProvider | CatalogChannelTemplate | CatalogModelOffering | CatalogRateCard,
>(records: readonly CatalogRecord[], kind: T['kind']): CatalogRecord<T>[] {
  return records.filter((record) => record.document.kind === kind) as CatalogRecord<T>[];
}

export function groupCredentials(
  rows: readonly { id: string; channel_resource_uid: string }[],
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const row of rows) {
    result.set(row.channel_resource_uid, [...(result.get(row.channel_resource_uid) ?? []), row.id]);
  }
  return result;
}

export function stripDates<T extends object>(value: T): Record<string, unknown> {
  const result = { ...value } as Record<string, unknown>;
  delete result.created_at;
  delete result.updated_at;
  return result;
}

export function compareResource(
  a: { document: { resource_uid: string } },
  b: { document: { resource_uid: string } },
): number {
  return a.document.resource_uid.localeCompare(b.document.resource_uid);
}
