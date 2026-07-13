import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import MediaChromeAdapter from './adapters/media-chrome';
import { usePlaybackRegistry } from './PlaybackRegistry';
import type { FloatingMediaPlayerProps } from './types';

/** Portal overlay that mounts media-chrome and claims exclusive playback. */
export default function FloatingMediaPlayer({
  src,
  poster,
  playerId,
  aspectRatio,
  objectFit = 'contain',
  onClose,
}: FloatingMediaPlayerProps) {
  const registry = usePlaybackRegistry();
  const onCloseRef = useRef(onClose);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && !element.contains(dialog))
      .map((element) => ({
        element,
        inert: element.inert,
        ariaHidden: element.getAttribute('aria-hidden'),
      }));
    background.forEach(({ element }) => {
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const focusable = getFocusable(dialog);
      if (focusable.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusRaf = requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      cancelAnimationFrame(focusRaf);
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prev;
      background.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
      });
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    registry.claim(playerId, () => onCloseRef.current());
    return () => registry.release(playerId);
  }, [playerId, registry]);

  return createPortal(
    <div
      ref={dialogRef}
      className="cmp-float nodrag nowheel"
      role="dialog"
      aria-modal="true"
      aria-label="视频播放"
      tabIndex={-1}
      onClick={() => onCloseRef.current()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="cmp-float__panel" onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} type="button" className="cmp-float__close nodrag" onClick={() => onCloseRef.current()}>
          关闭 Esc
        </button>
        <MediaChromeAdapter
          src={src}
          poster={poster}
          playerId={playerId}
          aspectRatio={aspectRatio}
          objectFit={objectFit}
          variant="floating"
          expandable={false}
          autoPlayOnMount
        />
      </div>
    </div>,
    document.body,
  );
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), audio[controls], video[controls], media-play-button, media-time-range, media-mute-button, media-fullscreen-button, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
}
