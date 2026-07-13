import {
  MediaControlBar,
  MediaController,
  MediaFullscreenButton,
  MediaMuteButton,
  MediaPlayButton,
  MediaTimeDisplay,
  MediaTimeRange,
} from 'media-chrome/react';

import { useEffect, useRef } from 'react';

import type { CanvasMediaPlayerProps } from '../types';

const ExpandIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    aria-hidden
  >
    <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M21 15v6h-6" />
  </svg>
);

/**

 * media-chrome adapter — the only file allowed to import `media-chrome/*`.

 * Control chrome is `nodrag nowheel`; the video surface is not, so React Flow

 * can still drag the node from the picture.

 */

export default function MediaChromeAdapter({
  src,

  poster,

  aspectRatio,

  objectFit = 'cover',

  variant = 'inline',

  expandable,

  className,

  onExpand,

  autoPlayOnMount,
}: CanvasMediaPlayerProps) {
  const showExpand = expandable ?? variant === 'inline';

  const floating = variant === 'floating';

  const rootClass = ['cmp', floating ? 'cmp--floating' : 'cmp--inline', className ?? '']

    .filter(Boolean)

    .join(' ');

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!autoPlayOnMount || !src) return;

    const el = videoRef.current;

    if (!el) return;

    void el.play().catch(() => undefined);
  }, [autoPlayOnMount, src]);

  return (
    <div className={rootClass} style={{ aspectRatio }}>
      <MediaController className="cmp__controller">
        <video
          ref={videoRef}
          slot="media"
          src={src ?? undefined}
          poster={poster ?? undefined}
          playsInline
          preload="metadata"
          draggable={false}
          className="cmp__video"
          style={{ objectFit }}
        />

        <MediaControlBar className="cmp__bar nodrag nowheel">
          <MediaPlayButton className="nodrag" />

          <MediaTimeRange className="nodrag" />

          <MediaTimeDisplay showDuration className="nodrag" />

          <MediaMuteButton className="nodrag" />

          {floating ? <MediaFullscreenButton className="nodrag" /> : null}

          {showExpand && onExpand ? (
            <button
              type="button"
              className="cmp__expand nodrag"
              title="放大播放"
              aria-label="放大播放"
              onClick={(e) => {
                e.stopPropagation();

                onExpand();
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {ExpandIcon}
            </button>
          ) : null}
        </MediaControlBar>
      </MediaController>
    </div>
  );
}
