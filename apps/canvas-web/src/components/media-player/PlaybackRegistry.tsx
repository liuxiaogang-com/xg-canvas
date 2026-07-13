import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

type StopFn = () => void;

interface PlaybackRegistryValue {
  /** Register as the sole active player; previous owner is stopped. */
  claim(playerId: string, stop: StopFn): void;
  /** Release if this id is still the active owner. */
  release(playerId: string): void;
}

const PlaybackRegistryContext = createContext<PlaybackRegistryValue | null>(null);

/** Page-level single-active video ownership (canvas / quick-gen + modals). */
export function PlaybackRegistryProvider({ children }: { children: ReactNode }) {
  const activeId = useRef<string | null>(null);
  const activeStop = useRef<StopFn | null>(null);

  const claim = useCallback((playerId: string, stop: StopFn) => {
    if (activeId.current && activeId.current !== playerId) {
      activeStop.current?.();
    }
    activeId.current = playerId;
    activeStop.current = stop;
  }, []);

  const release = useCallback((playerId: string) => {
    if (activeId.current !== playerId) return;
    activeId.current = null;
    activeStop.current = null;
  }, []);

  const value = useMemo(() => ({ claim, release }), [claim, release]);

  return <PlaybackRegistryContext.Provider value={value}>{children}</PlaybackRegistryContext.Provider>;
}

export function usePlaybackRegistry(): PlaybackRegistryValue {
  const ctx = useContext(PlaybackRegistryContext);
  if (!ctx) {
    // Fallback no-op so isolated stories / tests don't crash.
    return {
      claim: () => undefined,
      release: () => undefined,
    };
  }
  return ctx;
}
