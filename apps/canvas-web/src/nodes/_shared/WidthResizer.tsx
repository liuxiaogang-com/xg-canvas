import { NodeResizeControl, ResizeControlVariant, type ResizeParams } from '@xyflow/react';

import { useCanvasStore } from '../../canvas/canvas-state';
import { useCanvasUI } from '../../canvas/ui-state';
import { scheduleNodeUpdate } from '../../canvas/sync/auto-save';

const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

/**
 * Corner drag handles for media nodes (image / video). We persist only the
 * width — the media box keeps its aspect ratio via a CSS `aspect-ratio` from
 * the node param, so height follows automatically. keepAspectRatio makes the
 * diagonal drag feel like a true proportional scale. Live width goes to
 * `data.width` (patchNodeData pauses undo). While dragging, `resizing` is set
 * so the inline form + toolbar hide; on end they reappear with the new size.
 */
export default function WidthResizer({
  id,
  visible,
  min = 180,
  max = 620,
}: {
  id: string;
  visible: boolean;
  min?: number;
  max?: number;
}) {
  const patch = useCanvasStore((s) => s.patchNodeData);
  const setResizing = useCanvasUI((s) => s.setResizing);
  if (!visible) return null;

  const onResizeStart = () => setResizing(true);
  const onResize = (_: unknown, p: ResizeParams) => patch(id, { width: Math.round(p.width) });
  const onResizeEnd = (_: unknown, p: ResizeParams) => {
    setResizing(false);
    // Persist the final width. updateNode REPLACES data, so send full node data.
    const st = useCanvasStore.getState();
    const node = st.nodes.find((n) => n.id === id);
    if (!st.projectId || !node) return;
    scheduleNodeUpdate(st.projectId, id, {
      data: { ...(node.data as Record<string, unknown>), width: Math.round(p.width) },
    });
  };

  return (
    <>
      {CORNERS.map((pos) => (
        <NodeResizeControl
          key={pos}
          className="noderz-corner"
          position={pos}
          variant={ResizeControlVariant.Handle}
          keepAspectRatio
          minWidth={min}
          maxWidth={max}
          onResizeStart={onResizeStart}
          onResize={onResize}
          onResizeEnd={onResizeEnd}
        />
      ))}
    </>
  );
}
