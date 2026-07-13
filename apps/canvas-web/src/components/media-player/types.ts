export type MediaObjectFit = 'cover' | 'contain';

export type MediaPlayerVariant = 'inline' | 'floating';

/**
 * Stable public API for canvas video playback.
 * Nodes must depend only on this shape — never on media-chrome / xgplayer directly.
 */
export interface CanvasMediaPlayerProps {
  /** Full video URL; only loaded while playing / floating. May arrive after activate. */
  src?: string | null;
  /** Poster image URL; shown while idle (no video network load). */
  poster?: string | null;
  /** Unique id for page-level single-play ownership. */
  playerId: string;
  /** CSS aspect-ratio value, e.g. "16 / 9" */
  aspectRatio: string;
  objectFit?: MediaObjectFit;
  variant?: MediaPlayerVariant;
  /** Show expand control on inline players (default true for inline). */
  expandable?: boolean;
  /** Start playing as soon as the full src is available (floating). */
  autoPlayOnMount?: boolean;
  className?: string;
  /**
   * Called when the user wants to play / expand but the parent still needs to
   * mint the full video URL (lazy fetch). Facade waits until `src` arrives.
   */
  onActivate?: () => void;
  /** If omitted and expandable, facade opens the floating portal itself. */
  onExpand?: () => void;
}

export interface FloatingMediaPlayerProps {
  src: string;
  poster?: string | null;
  playerId: string;
  aspectRatio: string;
  objectFit?: MediaObjectFit;
  onClose: () => void;
}
