import { useEffect, useState } from 'react';

import { invalidateAssetUrlCache } from './useAssetUrl';
import { ensureVideoThumb } from '../lib/ensure-video-thumb';

/**
 * After an explicit user action, attempt to attach a poster if missing.
 * Callers must pass null while rendering passive feed/grid previews.
 * Bumps `revision` when ensure succeeds so poster URL hooks can refetch.
 */
export function useEnsureVideoThumb(assetId: string | null | undefined): number {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    void ensureVideoThumb(assetId).then((updated) => {
      if (cancelled || !updated?.thumb_storage_key) return;
      invalidateAssetUrlCache(assetId);
      setRevision((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  return revision;
}
