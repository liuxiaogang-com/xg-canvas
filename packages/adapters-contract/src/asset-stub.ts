/**
 * AssetStub - what an adapter knows about a vendor asset BEFORE it has
 * been downloaded into object storage. Used internally inside an adapter
 * so the same array can be fed into AssetDownloader and become ProducedAsset[].
 */

export interface AssetStub {
  url: string;
  mime_type?: string;
  filename?: string;
  /** Same role tags that end up on ProducedAsset. */
  role?: string;
  /** Vendor-reported intrinsic dimensions, kept for fast-path metadata. */
  width?: number;
  height?: number;
  duration_ms?: number;
}
