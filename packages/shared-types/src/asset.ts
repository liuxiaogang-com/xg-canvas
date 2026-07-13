/**
 * Asset DTOs.
 * Spec: docs/architecture.md and docs/task-lifecycle.md.
 *
 * All assets are persisted in our S3/R2-compatible bucket; frontend never
 * receives a third-party CDN URL directly. Adapters return StorageDescriptor
 * metadata, and canvas-api writes the canvas.assets row.
 */

import type { IOType } from './io-types';

export const ASSET_TYPES = ['image', 'video', 'audio', 'text', 'json'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_SCOPES = ['workspace', 'project'] as const;
export type AssetScope = (typeof ASSET_SCOPES)[number];

/**
 * Who can see an asset, independent from storage scope:
 * - private: owner only (personal assets)
 * - project: members with project.asset.view on the project
 * - workspace: any workspace member
 */
export const ASSET_VISIBILITIES = ['private', 'project', 'workspace'] as const;
export type AssetVisibility = (typeof ASSET_VISIBILITIES)[number];

/**
 * Returned by adapters once content is downloaded into object storage.
 * canvas-api turns this into an `assets` row.
 */
export interface StorageDescriptor {
  /** Object key, e.g. xgcanvas/{ws}/{project}/{yyyy}/{mm}/{uuid}.{ext} */
  storage_key: string;
  bucket: string;
  size_bytes: number;
  mime_type: string;
  /** Hex sha256 of the streamed bytes. */
  sha256: string;
  /** Native dimensions when applicable (image / video frame). */
  width?: number;
  height?: number;
  /** Duration in milliseconds for video / audio. */
  duration_ms?: number;
}

export interface Asset {
  id: string;
  type: AssetType;
  scope: AssetScope;
  visibility: AssetVisibility;
  workspace_id: string;
  /** Required when scope === 'project'. */
  project_id?: string;
  storage: StorageDescriptor;
  /** Pre-signed URL minted on demand; never persisted. */
  url?: string;
  /** Free-form display label. */
  name?: string;
  /** Producing task; null for uploads. */
  source_task_id?: string;
  /** Tags drive search / @-mention picker. */
  tags: string[];
  created_at: string;
}

/**
 * Maps an IO port type to the asset type that actually carries the bytes.
 * Used by canvas-api when persisting node outputs.
 */
export function ioToAssetType(io: IOType): AssetType | null {
  switch (io) {
    case 'image':
    case 'image_list':
    case 'grid':
    case 'mask':
    case 'reference':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'text':
      return 'text';
    case 'json':
      return 'json';
    case 'style_token':
    case 'entity_ref':
    case 'library_ref':
      return null;
  }
}
