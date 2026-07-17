export type CatalogOriginKind = 'official' | 'local';
export const CATALOG_VISIBILITIES = ['public', 'internal', 'hidden'] as const;
export type CatalogVisibility = (typeof CATALOG_VISIBILITIES)[number];

export function isCatalogVisibility(value: unknown): value is CatalogVisibility {
  return typeof value === 'string' &&
    (CATALOG_VISIBILITIES as readonly string[]).includes(value);
}

export function assertCatalogVisibility(value: unknown): CatalogVisibility {
  if (!isCatalogVisibility(value)) {
    throw new Error(`invalid Catalog visibility: ${String(value)}`);
  }
  return value;
}

export interface CatalogOrigin {
  kind: CatalogOriginKind;
  source_id: string;
  resource_uid: string;
  revision: number;
  revision_id: string;
  release_id: string | null;
}

/** Immutable model selection captured when a task is created. */
export interface ModelRevisionPin {
  model_resource_uid: string;
  model_revision_id: string;
  rate_card_revision_id: string | null;
  catalog_epoch: string;
}

/**
 * Non-secret adapter route values frozen when an asynchronous vendor job is
 * submitted. Poll/cancel must reuse these values instead of rebuilding a route
 * from a newer Channel revision or newer runtime overrides.
 */
export interface ChannelRouteSnapshot {
  key: string;
  base_url?: string;
  options: Record<string, unknown>;
}
