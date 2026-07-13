import { useCallback, useState } from 'react';

import { useAssetUrl } from '../../hooks/useAssetUrl';
import { useEnsureVideoThumb } from '../../hooks/useEnsureVideoThumb';
import CanvasMediaPlayer from './CanvasMediaPlayer';

interface LazyVideoPlayerProps {
  assetId: string;
  playerId: string;
  aspectRatio: string;
  objectFit?: 'cover' | 'contain';
  className?: string;
  expandable?: boolean;
}

/** Poster-first player: full video URL is minted only after user activates. */
export default function LazyVideoPlayer({
  assetId,
  playerId,
  aspectRatio,
  objectFit = 'cover',
  className,
  expandable,
}: LazyVideoPlayerProps) {
  const [active, setActive] = useState(false);
  const [activationRevision, setActivationRevision] = useState(0);
  // Historical videos are repaired only after explicit play/expand. Merely
  // mounting a canvas/feed grid must not start range reads and decoding.
  const revision = useEnsureVideoThumb(active ? assetId : null);
  const poster = useAssetUrl(assetId, 3600, 'thumb', revision);
  const src = useAssetUrl(active ? assetId : null, 3600, 'full', activationRevision);
  const onActivate = useCallback(() => {
    if (active && !src) setActivationRevision((revision) => revision + 1);
    setActive(true);
  }, [active, src]);

  return (
    <CanvasMediaPlayer
      playerId={playerId}
      poster={poster}
      src={src}
      aspectRatio={aspectRatio}
      objectFit={objectFit}
      className={className}
      expandable={expandable}
      onActivate={onActivate}
    />
  );
}
