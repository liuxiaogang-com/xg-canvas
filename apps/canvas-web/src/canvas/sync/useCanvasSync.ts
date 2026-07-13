import { useEffect } from 'react';

import { flushAll } from './auto-save';

/**
 * On tab-hide / page-leave, flush any pending debounced server updates so a
 * just-made edit isn't lost to the debounce window. The server is the source of
 * truth (forward edits persist eagerly; undo/redo reconcile via /replace); a
 * local cache layer can be reintroduced later on top of this.
 */
export function useCanvasSync(): void {
  useEffect(() => {
    const onLeave = () => flushAll();
    const onVisibility = () => {
      if (document.hidden) flushAll();
    };
    window.addEventListener('pagehide', onLeave);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      flushAll();
      window.removeEventListener('pagehide', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}
