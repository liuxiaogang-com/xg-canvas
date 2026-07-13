import type { Node } from '@xyflow/react';

import { canvasApi } from '../api/canvas';
import { createClientId } from '../lib/id';
import { toast } from '../ui';
import type { CanvasNodeData } from '../nodes/types';
import { useCanvasStore } from './canvas-state';
import { notifySyncError } from './sync/sync-error';

const PAD = 28;
const LABEL_SPACE = 26;

function dims(n: Node): { w: number; h: number } {
  return { w: n.measured?.width ?? 240, h: n.measured?.height ?? 160 };
}
function strip(d: CanvasNodeData): Record<string, unknown> {
  const { status: _s, task_id: _t, ...rest } = d as CanvasNodeData & { status?: unknown; task_id?: unknown };
  return rest as Record<string, unknown>;
}

/** Group the currently multi-selected top-level nodes into a group container. */
export async function groupSelected(projectId: string): Promise<void> {
  const st = useCanvasStore.getState();
  const sel = st.nodes.filter((n) => n.selected && n.type !== 'group' && !n.parentId);
  if (sel.length < 2) {
    toast.info('多选至少 2 个节点再打组（Shift 点选 / 框选）');
    return;
  }
  const minX = Math.min(...sel.map((n) => n.position.x)) - PAD;
  const minY = Math.min(...sel.map((n) => n.position.y)) - PAD - LABEL_SPACE;
  const maxX = Math.max(...sel.map((n) => n.position.x + dims(n).w)) + PAD;
  const maxY = Math.max(...sel.map((n) => n.position.y + dims(n).h)) + PAD;
  const width = Math.round(maxX - minX);
  const height = Math.round(maxY - minY);

  let groupId = createClientId();
  try {
    const created = await canvasApi.createNode(projectId, {
      type: 'group',
      position: { x: minX, y: minY },
      data: { label: '分组', width, height } as never,
    });
    groupId = created.id;
  } catch {
    // backend rejected 'group' — keep client-only (works this session).
  }

  const ids = new Set(sel.map((n) => n.id));
  const groupNode: Node<CanvasNodeData> = {
    id: groupId,
    type: 'group',
    position: { x: minX, y: minY },
    data: { label: '分组', width, height } as never,
    style: { width, height },
    selected: false,
  };
  useCanvasStore.getState().setNodes((prev) => [
    groupNode,
    ...prev.map((n) =>
      ids.has(n.id)
        ? {
            ...n,
            parentId: groupId,
            position: { x: n.position.x - minX, y: n.position.y - minY },
            selected: false,
            data: { ...n.data, parent_id: groupId },
          }
        : n,
    ),
  ]);
  useCanvasStore.getState().setSelected(null);

  for (const n of sel) {
    canvasApi
      .updateNode(projectId, n.id, {
        position: { x: n.position.x - minX, y: n.position.y - minY },
        data: { ...strip(n.data), parent_id: groupId } as never,
      })
      .catch((e) => notifySyncError(e, 'group child update'));
  }
}

/** Ungroup the selected group(s) (or the group owning a selected child). */
export async function ungroupSelected(projectId: string): Promise<void> {
  const st = useCanvasStore.getState();
  const groups = st.nodes.filter(
    (n) => n.type === 'group' && (n.selected || st.nodes.some((c) => c.parentId === n.id && c.selected)),
  );
  if (groups.length === 0) {
    toast.info('请选中一个组再拆开');
    return;
  }
  const gpos = new Map(groups.map((g) => [g.id, g.position]));
  const gids = new Set(groups.map((g) => g.id));
  const children = st.nodes.filter((n) => n.parentId && gids.has(n.parentId));

  useCanvasStore.getState().setNodes((prev) =>
    prev
      .filter((n) => !gids.has(n.id))
      .map((n) => {
        if (n.parentId && gids.has(n.parentId)) {
          const gp = gpos.get(n.parentId);
          const d = { ...n.data } as Record<string, unknown>;
          delete d.parent_id;
          return {
            ...n,
            parentId: undefined,
            position: { x: n.position.x + (gp?.x ?? 0), y: n.position.y + (gp?.y ?? 0) },
            data: d as never,
          };
        }
        return n;
      }),
  );

  for (const g of groups) canvasApi.removeNode(projectId, g.id).catch((e) => notifySyncError(e, 'ungroup remove'));
  for (const n of children) {
    const gp = gpos.get(n.parentId as string);
    const d = strip(n.data);
    delete d.parent_id;
    canvasApi
      .updateNode(projectId, n.id, {
        position: { x: n.position.x + (gp?.x ?? 0), y: n.position.y + (gp?.y ?? 0) },
        data: d as never,
      })
      .catch((e) => notifySyncError(e, 'ungroup child update'));
  }
}
