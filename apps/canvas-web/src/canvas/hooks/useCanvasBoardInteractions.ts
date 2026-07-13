import {
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
} from 'react';

import { toast } from '../../ui';
import { createAssetNodesFromFiles, filesFromClipboard } from '../asset-drop';
import { hasClipboard, pasteClipboard } from '../clipboard-ops';
import { isEditableTarget } from '../shortcuts/keymap';
import { useCanvasUI } from '../ui-state';

interface Point {
  x: number;
  y: number;
}

interface Options {
  projectId: string;
  screenToFlowPosition(position: Point): Point;
  onPaneMenu?(x: number, y: number, flow: Point): void;
}

export function useCanvasBoardInteractions({
  projectId,
  screenToFlowPosition,
  onPaneMenu,
}: Options) {
  const pointerRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // Recover UI state if a resize/drag ends outside the browser window.
  useEffect(() => {
    const clear = () => {
      const ui = useCanvasUI.getState();
      if (ui.resizing) ui.setResizing(false);
      if (ui.dragging) ui.setDragging(false);
    };
    window.addEventListener('pointerup', clear);
    window.addEventListener('mouseup', clear);
    return () => {
      window.removeEventListener('pointerup', clear);
      window.removeEventListener('mouseup', clear);
    };
  }, []);

  const openSurfaceMenu = useCallback(
    (target: EventTarget | null, clientX: number, clientY: number): boolean => {
      const element = target as Element | null;
      if (
        !element ||
        element.closest(
          '.react-flow__node, .react-flow__edge, .react-flow__controls, .react-flow__minimap, .react-flow__panel',
        )
      ) {
        return false;
      }
      onPaneMenu?.(clientX, clientY, screenToFlowPosition({ x: clientX, y: clientY }));
      return true;
    },
    [onPaneMenu, screenToFlowPosition],
  );

  const boardRef = useRef<HTMLDivElement>(null);
  const onSurfaceDblClick = useCallback(
    (event: ReactMouseEvent) => {
      if (openSurfaceMenu(event.target, event.clientX, event.clientY)) event.preventDefault();
    },
    [openSurfaceMenu],
  );

  useEffect(() => {
    const element = boardRef.current;
    if (!element) return;
    const onContextMenu = (event: MouseEvent) => {
      if (openSurfaceMenu(event.target, event.clientX, event.clientY)) event.preventDefault();
    };
    element.addEventListener('contextmenu', onContextMenu, true);
    return () => element.removeEventListener('contextmenu', onContextMenu, true);
  }, [openSurfaceMenu]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isEditableTarget(document.activeElement)) return;
      if (!useCanvasUI.getState().canEdit) return;
      const files = filesFromClipboard(event.clipboardData);
      if (files.length) {
        event.preventDefault();
        event.stopPropagation();
        const position = screenToFlowPosition(pointerRef.current);
        void createAssetNodesFromFiles(projectId, files, position);
        return;
      }
      if (hasClipboard()) {
        event.preventDefault();
        void pasteClipboard(projectId);
      }
    };
    window.addEventListener('paste', onPaste, true);
    return () => window.removeEventListener('paste', onPaste, true);
  }, [projectId, screenToFlowPosition]);

  const onBoardDragOver = useCallback((event: ReactDragEvent) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onBoardDrop = useCallback(
    (event: ReactDragEvent) => {
      if (!event.dataTransfer?.files?.length) return;
      event.preventDefault();
      event.stopPropagation();
      if (!useCanvasUI.getState().canEdit) {
        toast.error('只读模式:你没有编辑权限');
        return;
      }
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      void createAssetNodesFromFiles(projectId, event.dataTransfer.files, position);
    },
    [projectId, screenToFlowPosition],
  );

  return { boardRef, pointerRef, onSurfaceDblClick, onBoardDragOver, onBoardDrop };
}
