/** Stable Catalog resource UUIDs cannot be reassigned to a different owner. */
export function assertStableCatalogOwner(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): void {
  if (previous.kind !== next.kind) throw new Error('Catalog resource kind cannot change');
  if (previous.slug !== next.slug) throw new Error('Catalog resource slug cannot change');
  if (previous.kind === 'model_offering' && previous.model_id !== next.model_id) {
    throw new Error('Catalog model_id cannot change; create a new resource instead');
  }
  const ownerKey = ownerField(String(previous.kind));
  if (ownerKey && previous[ownerKey] !== next[ownerKey]) {
    throw new Error(`Catalog ${String(previous.kind)} owner ${ownerKey} cannot change`);
  }
}

function ownerField(kind: string): string | null {
  if (kind === 'channel_template' || kind === 'model_offering') return 'provider_uid';
  if (kind === 'rate_card') return 'model_uid';
  return null;
}
