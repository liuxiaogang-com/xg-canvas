/**
 * Unified reusable-resource library (人物库 / 音色库 / 风格库...).
 * Spec: docs/architecture.md §资产存储 and docs/adapter-guide.md.
 *
 * An entry carries two coexisting binding forms:
 * - material: assets in our own bucket (reference images / sample audio) —
 *   portable to any provider that accepts reference inputs.
 * - provider_refs: vendor-side resources (trained voice ids, licensed portrait
 *   ids) — only usable on that provider, injected natively by its adapter.
 */

import type { AssetVisibility } from './asset';

export const LIBRARY_KINDS = ['character', 'voice', 'style'] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

export interface LibraryMaterial {
  asset_ids: string[];
}

export type LibraryProviderRefStatus = 'verifying' | 'training' | 'ready' | 'failed' | 'revoked';

/**
 * Persisted vendor binding metadata.
 *
 * The credential-aware fields are written by canvas-api after a provider-side
 * binding flow. They remain optional here so existing rows can still be read;
 * consumers must use `isServerOwnedLibraryProviderRef` before invoking a
 * provider-native resource.
 */
export interface LibraryProviderRef {
  /** Stable id for this server-owned binding. */
  binding_id?: string;
  /** Provider key from the model registry (e.g. 'volcengine', 'bailian'). */
  provider: string;
  /** Exact channel that created and may consume the vendor resource. */
  channel_id?: string;
  /** Exact credential that owns the vendor resource. */
  credential_id?: string;
  /** Vendor-side resource id: voice_id, portrait authorization id, ... */
  external_ref_id: string;
  /** Parameters returned and verified by the provider binding flow. */
  verified_params?: Record<string, unknown>;
  /** @deprecated Legacy client-shaped metadata. Never consume for invoke. */
  params?: Record<string, unknown>;
  /** Optional local preview/sample asset for this vendor resource. */
  sample_asset_id?: string;
  /** Server-owned lifecycle state; only an explicitly verified binding is ready. */
  status: LibraryProviderRefStatus;
  verified_at?: string;
  error?: { code: string; message: string };
}

/** Credential-aware binding produced and owned by canvas-api. */
export interface ServerOwnedLibraryProviderRef extends LibraryProviderRef {
  binding_id: string;
  channel_id: string;
  credential_id: string;
  params?: never;
}

/** Credential-free projection returned by public Library APIs. */
export interface PublicLibraryProviderRef {
  binding_id?: string;
  provider: string;
  /** Masked display value; never the raw provider-side identifier. */
  external_ref_id: string;
  sample_asset_id?: string;
  status: LibraryProviderRefStatus;
  verified_at?: string;
}

/**
 * Reject legacy rows at the adapter boundary. Lifecycle readiness is checked
 * separately because callers may need to inspect verifying/training bindings.
 */
export function isServerOwnedLibraryProviderRef(
  ref: LibraryProviderRef,
): ref is ServerOwnedLibraryProviderRef {
  return (
    typeof ref.binding_id === 'string' &&
    ref.binding_id.length > 0 &&
    typeof ref.channel_id === 'string' &&
    ref.channel_id.length > 0 &&
    typeof ref.credential_id === 'string' &&
    ref.credential_id.length > 0 &&
    (ref.verified_params === undefined ||
      (typeof ref.verified_params === 'object' &&
        ref.verified_params !== null &&
        !Array.isArray(ref.verified_params))) &&
    ref.params === undefined
  );
}

export interface LibraryEntry {
  id: string;
  kind: LibraryKind | string;
  scope: 'workspace' | 'project';
  visibility: AssetVisibility;
  workspace_id: string;
  project_id: string | null;
  owner_id: string;
  name: string;
  description: string | null;
  tags: string[];
  cover_asset_id: string | null;
  material: LibraryMaterial | null;
  provider_refs: PublicLibraryProviderRef[];
  created_at: string;
  updated_at: string;
}

export interface CreateLibraryEntryInput {
  kind: string;
  name: string;
  description?: string | null;
  project_id?: string;
  visibility?: AssetVisibility;
  tags?: string[];
  cover_asset_id?: string | null;
  material?: LibraryMaterial | null;
}

export type UpdateLibraryEntryInput = Partial<
  Pick<
    CreateLibraryEntryInput,
    'name' | 'description' | 'visibility' | 'tags' | 'cover_asset_id' | 'material'
  >
>;
