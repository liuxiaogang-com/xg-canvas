import { useCallback, useEffect, useRef, useState } from 'react';

import './CanvasMediaPlayer.css';
import MediaChromeAdapter from './adapters/media-chrome';
import FloatingMediaPlayer from './FloatingMediaPlayer';
import { usePlaybackRegistry } from './PlaybackRegistry';
import type { CanvasMediaPlayerProps } from './types';

/**
 * Stable canvas media player facade.
 * Idle = poster only (no video src). Playing mounts media-chrome after claim.
 */
export default function CanvasMediaPlayer(props: CanvasMediaPlayerProps) {
  const {
    src,
    poster,
    playerId,
    aspectRatio,
    objectFit = 'cover',
    variant = 'inline',
    expandable,
    autoPlayOnMount,
    className,
    onActivate,
    onExpand,
  } = props;

  const registry = usePlaybackRegistry();
  const [wantPlay, setWantPlay] = useState(!!autoPlayOnMount);
  const [open, setOpen] = useState(false);
  const [expandRequested, setExpandRequested] = useState(false);
  const stopRef = useRef<() => void>(() => undefined);

  const canExpand = expandable ?? variant === 'inline';
  const floating = variant === 'floating';
  const playing = wantPlay && !!src && !open;

  const stop = useCallback(() => {
    setWantPlay(false);
  }, []);

  stopRef.current = stop;

  const requestPlay = useCallback(() => {
    onActivate?.();
    setWantPlay(true);
  }, [onActivate]);

  useEffect(() => {
    if (!playing) {
      registry.release(playerId);
      return;
    }
    registry.claim(playerId, () => stopRef.current());
    return () => registry.release(playerId);
  }, [playing, playerId, registry]);

  useEffect(() => {
    if (autoPlayOnMount) {
      onActivate?.();
      setWantPlay(true);
    }
  }, [autoPlayOnMount, onActivate]);

  useEffect(() => {
    if (expandRequested && src) {
      setExpandRequested(false);
      setOpen(true);
    }
    if (open && !src) setOpen(false);
  }, [expandRequested, open, src]);

  const handleExpand = useCallback(() => {
    onActivate?.();
    if (onExpand) {
      onExpand();
      return;
    }
    setWantPlay(false);
    if (src) setOpen(true);
    else setExpandRequested(true);
  }, [onActivate, onExpand, src]);

  const rootClass = ['cmp', floating ? 'cmp--floating' : 'cmp--inline', className ?? '']
    .filter(Boolean)
    .join(' ');

  if (open) {
    return (
      <>
        <div className={rootClass} style={{ aspectRatio }}>
          {poster ? (
            <img
              src={poster}
              alt=""
              className="cmp__poster"
              draggable={false}
              style={{ objectFit }}
            />
          ) : (
            <div className="cmp__poster-ph" />
          )}
        </div>
        {src ? (
          <FloatingMediaPlayer
            src={src}
            poster={poster}
            playerId={`${playerId}:float`}
            aspectRatio={aspectRatio}
            objectFit={objectFit ?? 'contain'}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </>
    );
  }

  if (playing && src) {
    return (
      <MediaChromeAdapter
        src={src}
        poster={poster}
        playerId={playerId}
        aspectRatio={aspectRatio}
        objectFit={objectFit}
        variant={variant}
        expandable={canExpand && variant === 'inline'}
        onExpand={canExpand && variant === 'inline' ? handleExpand : undefined}
        className={className}
        autoPlayOnMount
      />
    );
  }

  return (
    <div className={rootClass} style={{ aspectRatio }}>
      {poster ? (
        <img src={poster} alt="" className="cmp__poster" draggable={false} style={{ objectFit }} />
      ) : (
        <div className="cmp__poster-ph" />
      )}
      <button
        type="button"
        className="cmp__play-hit nodrag"
        aria-label="播放"
        aria-busy={wantPlay && !src}
        onClick={(e) => {
          e.stopPropagation();
          requestPlay();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span
          className={`cmp__play-icon${wantPlay && !src ? ' cmp__play-icon--loading' : ''}`}
          aria-hidden
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M8 5.5v13l11-6.5L8 5.5z" />
          </svg>
        </span>
      </button>
      {canExpand && variant === 'inline' ? (
        <button
          type="button"
          className="cmp__expand-idle nodrag"
          title="放大播放"
          aria-label="放大播放"
          aria-busy={expandRequested && !src}
          onClick={(e) => {
            e.stopPropagation();
            handleExpand();
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
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
        </button>
      ) : null}
    </div>
  );
}

export type { CanvasMediaPlayerProps, FloatingMediaPlayerProps, MediaObjectFit } from './types';
export { default as FloatingMediaPlayer } from './FloatingMediaPlayer';
export { PlaybackRegistryProvider, usePlaybackRegistry } from './PlaybackRegistry';
