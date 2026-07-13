import { useEffect, useRef } from 'react';

import { SHORTCUTS, comboFromEvent, isEditableTarget, type ShortcutId } from './keymap';
import { useShortcutStore } from './shortcut-store';

export type ShortcutHandlers = Partial<Record<ShortcutId, () => void>>;

/**
 * Global keydown dispatcher for canvas shortcuts. Mount once on the canvas.
 * - intercept actions (Ctrl+S/F) always preventDefault, even inside inputs.
 * - non-intercept actions are skipped while typing in an input/textarea.
 */
export function useCanvasShortcuts(handlers: ShortcutHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  const custom = useShortcutStore((s) => s.custom);

  useEffect(() => {
    const keysFor = useShortcutStore.getState().keysFor;
    const onKey = (e: KeyboardEvent) => {
      const combo = comboFromEvent(e);
      if (!combo) return;
      const def = SHORTCUTS.find((s) => keysFor(s.id) === combo);
      if (!def) return;

      const editable = isEditableTarget(document.activeElement);
      if (editable && !def.intercept) return;

      // Ctrl+V: do NOT preventDefault — the board paste listener needs the
      // native paste event so clipboardData.files (screenshots / OS files) are
      // available. Node-clipboard paste is handled there as a fallback.
      if (def.id === 'edit.paste') return;

      if (def.intercept) e.preventDefault();
      const h = ref.current[def.id];
      if (h) {
        e.preventDefault();
        h();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // re-bind when custom mappings change so new keys take effect
  }, [custom]);
}
