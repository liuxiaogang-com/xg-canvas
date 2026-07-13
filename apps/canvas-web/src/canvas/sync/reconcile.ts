import { canvasApi } from '../../api/canvas';
import { useCanvasStore } from '../canvas-state';
import { notifySyncError } from './sync-error';

/**
 * Push the client's ENTIRE current canvas to the server (upsert + prune). Used
 * to reconcile after operations that mutate the store without going through the
 * per-node API — chiefly undo/redo — so the server never keeps orphan rows and
 * a refresh / another device sees exactly what the user sees. Debounced so a
 * burst of undos collapses into one request.
 */

const TRANSIENT = new Set(['status', 'task_id']);

function cleanData(node: { data: Record<string, unknown>; parentId?: string }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node.data)) {
    if (!TRANSIENT.has(k)) out[k] = v;
  }
  if (node.parentId) out.parent_id = node.parentId;
  return out;
}

let timer: ReturnType<typeof setTimeout> | null = null;

async function push(projectId: string): Promise<void> {
  const s = useCanvasStore.getState();
  if (!s.loaded) return;
  const nodes = s.nodes.map((n) => ({
    id: n.id,
    type: n.type ?? 'gen_text',
    position: n.position,
    data: cleanData(n as { data: Record<string, unknown>; parentId?: string }),
  }));
  const edges = s.edges.map((e) => ({
    id: e.id,
    source_node_id: e.source,
    source_handle: 'out',
    target_node_id: e.target,
    target_handle: 'in',
    data_type: (e.data as { data_type?: string } | undefined)?.data_type ?? '',
  }));
  await canvasApi
    .replaceCanvas(projectId, { nodes, edges, viewport: s.viewport })
    .catch((e) => notifySyncError(e, 'undo/redo reconcile'));
}

export function scheduleReconcile(projectId: string, delayMs = 450): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void push(projectId);
  }, delayMs);
}
