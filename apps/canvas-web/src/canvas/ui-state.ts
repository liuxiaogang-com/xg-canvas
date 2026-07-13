import { create } from 'zustand';

/**
 * Transient canvas UI state that should NOT live in the persisted canvas store
 * (no undo history, never synced). Currently: whether a node is being
 * drag-resized, so the inline param form + node toolbar can hide during the
 * drag and reappear (with the new size) when it ends.
 */
/** Interaction preference for the board pointer:
 *  - 'move'   : drag pans, wheel zooms (default).
 *  - 'select' : left-drag box-selects, wheel pans, Alt+wheel zooms, middle/right-drag pans. */
export type PointerMode = 'move' | 'select';

interface CanvasUIState {
  resizing: boolean;
  setResizing(v: boolean): void;
  /** Whether a node is currently being dragged — suppress toolbars / panels while
   *  the user is positioning so the UI is clear. */
  dragging: boolean;
  setDragging(v: boolean): void;
  pointerMode: PointerMode;
  setPointerMode(m: PointerMode): void;
  /** Whether the current user may edit this project's canvas (project.canvas.node.edit).
   *  Single source of truth for component-level read-only gating; set by CanvasPage. */
  canEdit: boolean;
  setCanEdit(v: boolean): void;
}

export const useCanvasUI = create<CanvasUIState>((set) => ({
  resizing: false,
  setResizing(v) {
    set({ resizing: v });
  },
  dragging: false,
  setDragging(v) {
    set({ dragging: v });
  },
  pointerMode: 'move',
  setPointerMode(m) {
    set({ pointerMode: m });
  },
  canEdit: true,
  setCanEdit(v) {
    set({ canEdit: v });
  },
}));
