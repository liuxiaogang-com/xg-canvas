import { canvasApi } from '../api/canvas';
import type { CanvasNodeData } from '../nodes/types';
import { toast } from '../ui';
import { useCanvasStore } from './canvas-state';
import { notifySyncError } from './sync/sync-error';

/**
 * Copy / paste / duplicate for canvas nodes. An in-memory clipboard (per app
 * session) holds the selected non-group nodes plus the edges *between* them
 * (by index), so pasting recreates the sub-graph with fresh server ids at an
 * offset. Wired to ⌘C / ⌘V / ⌘D and the node context menu.
 */
interface ClipNode {
  type: string;
  data: Record<string, unknown>;
  x: number;
  y: number;
}
interface ClipEdge {
  s: number;
  t: number;
  dataType: string;
}
interface Clip {
  nodes: ClipNode[];
  edges: ClipEdge[];
}

let clipboard: Clip | null = null;

function strip(d: CanvasNodeData): Record<string, unknown> {
  const { status: _s, task_id: _t, parent_id: _p, ...rest } = d as CanvasNodeData & {
    status?: unknown;
    task_id?: unknown;
    parent_id?: unknown;
  };
  return rest as Record<string, unknown>;
}

/** Snapshot the current multi-selection (group containers excluded). */
function snapshotSelected(): Clip | null {
  const st = useCanvasStore.getState();
  const sel = st.nodes.filter((n) => n.selected && n.type !== 'group');
  if (sel.length === 0) return null;
  const idx = new Map(sel.map((n, i) => [n.id, i]));
  const nodes: ClipNode[] = sel.map((n) => ({
    type: n.type ?? 'gen_text',
    data: strip(n.data),
    x: n.position.x,
    y: n.position.y,
  }));
  const edges: ClipEdge[] = st.edges
    .filter((e) => idx.has(e.source) && idx.has(e.target))
    .map((e) => ({
      s: idx.get(e.source)!,
      t: idx.get(e.target)!,
      dataType: (e.data as { data_type?: string } | undefined)?.data_type ?? '',
    }));
  return { nodes, edges };
}

export function copySelected(): void {
  const snap = snapshotSelected();
  if (!snap) return;
  clipboard = snap;
  toast.success(`已复制 ${snap.nodes.length} 个节点`);
}

export function hasClipboard(): boolean {
  return !!clipboard && clipboard.nodes.length > 0;
}

/** Create a fresh copy of `clip` on the server at +offset and select it. */
async function pasteClip(projectId: string, clip: Clip, offset: number): Promise<void> {
  const created: { id: string; type: string; position: { x: number; y: number }; data: unknown }[] = [];
  try {
    for (const cn of clip.nodes) {
      const node = await canvasApi.createNode(projectId, {
        type: cn.type,
        position: { x: cn.x + offset, y: cn.y + offset },
        data: cn.data as never,
      });
      created.push(node);
    }
  } catch (e) {
    toast.error((e as Error).message || '粘贴失败');
    return;
  }
  useCanvasStore.getState().setNodes((prev) => [
    ...prev.map((n) => (n.selected ? { ...n, selected: false } : n)),
    ...created.map((c) => ({
      id: c.id,
      type: c.type,
      position: c.position,
      data: c.data as never,
      selected: true,
    })),
  ]);
  for (const ce of clip.edges) {
    const src = created[ce.s];
    const tgt = created[ce.t];
    if (!src || !tgt) continue;
    try {
      const saved = await canvasApi.createEdge(projectId, {
        source_node_id: src.id,
        source_handle: 'out',
        target_node_id: tgt.id,
        target_handle: 'in',
        data_type: ce.dataType,
      });
      useCanvasStore.getState().setEdges((prev) => [
        ...prev,
        {
          id: saved.id,
          source: src.id,
          target: tgt.id,
          sourceHandle: 'out',
          targetHandle: 'in',
          data: { data_type: saved.data_type },
        },
      ]);
    } catch (e) {
      notifySyncError(e, 'paste edge');
    }
  }
}

export async function pasteClipboard(projectId: string): Promise<void> {
  if (!clipboard) return;
  await pasteClip(projectId, clipboard, 48);
}

/** Copy + paste the current selection in one step (no clipboard mutation). */
export async function duplicateSelected(projectId: string): Promise<void> {
  const snap = snapshotSelected();
  if (snap) await pasteClip(projectId, snap, 48);
}
