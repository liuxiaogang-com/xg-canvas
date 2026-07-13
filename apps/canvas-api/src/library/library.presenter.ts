import type {
  LibraryEntry as PublicLibraryEntry,
  LibraryProviderRef,
  PublicLibraryProviderRef,
} from '@xgcanvas/shared-types';

import type { LibraryEntry as LibraryEntryEntity } from '../database/entities';

/** Public Library reads never expose credential routing or verifier output. */
export function presentLibraryEntry(entry: LibraryEntryEntity): PublicLibraryEntry {
  return {
    id: entry.id,
    kind: entry.kind,
    scope: entry.scope,
    visibility: entry.visibility,
    workspace_id: entry.workspace_id,
    project_id: entry.project_id,
    owner_id: entry.owner_id,
    name: entry.name,
    description: entry.description,
    tags: entry.tags ?? [],
    cover_asset_id: entry.cover_asset_id,
    material: entry.material,
    provider_refs: (entry.provider_refs ?? []).map(presentProviderRef),
    created_at: toIso(entry.created_at),
    updated_at: toIso(entry.updated_at),
  };
}

function presentProviderRef(ref: LibraryProviderRef): PublicLibraryProviderRef {
  return {
    binding_id: ref.binding_id,
    provider: ref.provider,
    external_ref_id: maskExternalRef(ref.external_ref_id),
    sample_asset_id: ref.sample_asset_id,
    status: ref.status ?? 'failed',
    verified_at: ref.verified_at,
  };
}

function maskExternalRef(value: string): string {
  const text = String(value ?? '').trim();
  if (text.length <= 2) return '*'.repeat(Math.max(1, text.length));
  if (text.length <= 6) return `${text[0]}***${text.at(-1)}`;
  return `${text.slice(0, 3)}***${text.slice(-3)}`;
}

function toIso(value: Date): string {
  return value.toISOString();
}
