import {
  isServerOwnedLibraryProviderRef,
  type LibraryProviderRef,
  type ResolvedGenerationReference,
  type ServerOwnedLibraryProviderRef,
} from '@xgcanvas/shared-types';

export interface ProviderRefCandidate {
  provider: string;
  channel_id: string;
  credential_id: string;
}

/**
 * Library-reference consumption helper for request builders.
 *
 * The task executor expands a library entry before invoke: material assets
 * arrive as plain url references, and the entry's vendor bindings ride along
 * in `metadata.library.provider_refs`. An adapter that can consume a vendor
 * native resource (trained voice id, licensed portrait id, ...) should prefer
 * its own provider's binding over the material url:
 *
 *   const native = pickProviderRef(ref, {
 *     provider: 'volcengine', channel_id: ctx.channelId,
 *     credential_id: ctx.credential.id,
 *   });
 *   if (native) body.voice_id = native.external_ref_id;
 *   else body.audio_url = ref.url; // material fallback
 */
export function pickProviderRef(
  ref: ResolvedGenerationReference,
  candidate: ProviderRefCandidate,
): ServerOwnedLibraryProviderRef | null {
  const library = (ref.metadata as { library?: { provider_refs?: LibraryProviderRef[] } } | undefined)?.library;
  const candidates = library?.provider_refs ?? [];
  return (
    candidates.find(
      (providerRef): providerRef is ServerOwnedLibraryProviderRef =>
        isServerOwnedLibraryProviderRef(providerRef) &&
        providerRef.status === 'ready' &&
        providerRef.provider === candidate.provider &&
        providerRef.channel_id === candidate.channel_id &&
        providerRef.credential_id === candidate.credential_id,
    ) ?? null
  );
}

/** True when a reference came from a library entry (has library metadata). */
export function isLibraryBacked(ref: ResolvedGenerationReference): boolean {
  return !!(ref.metadata as { library?: unknown } | undefined)?.library;
}
