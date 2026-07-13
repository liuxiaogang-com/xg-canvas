import { useCanvasStore } from '../../canvas/canvas-state';
import { scheduleNodeUpdate } from '../../canvas/sync/auto-save';

/**
 * Rename a node (or group) inline: update the store immediately (no undo step,
 * like other data patches) and persist the full data to the server. `label` is
 * used by group nodes, `title` by every other node.
 */
export function renameNode(id: string, value: string, field: 'title' | 'label' = 'title'): void {
  const st = useCanvasStore.getState();
  const node = st.nodes.find((n) => n.id === id);
  if (!st.projectId || !node) return;
  st.patchNodeData(id, { [field]: value } as never);
  scheduleNodeUpdate(st.projectId, id, {
    data: { ...(node.data as Record<string, unknown>), [field]: value },
  });
}
