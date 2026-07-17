import type { EntityManager } from 'typeorm';
import { CanvasNode, type Task } from './entities';

/** Apply a terminal Task to its source node; the newest task for a node always wins. */
export async function applyTaskTerminalProjection(
  task: Task,
  manager: EntityManager,
): Promise<boolean> {
  if (!task.source_node_id || !task.project_id) return false;

  const rows = await manager.query(
    `SELECT n.id, n.canvas_id, n.data
       FROM canvas.canvas_nodes n
       JOIN canvas.canvases c ON c.id = n.canvas_id
       JOIN canvas.projects p ON p.id = c.project_id
      WHERE n.id = $1 AND p.id = $2 AND p.workspace_id = $3
      FOR UPDATE OF n`,
    [task.source_node_id, task.project_id, task.workspace_id],
  );
  const node = rows[0] as
    | {
        id: string;
        canvas_id: string;
        data: Record<string, unknown>;
      }
    | undefined;
  if (!node) return false;

  const newer = await manager.query(
    `SELECT 1
       FROM canvas.tasks candidate
       JOIN canvas.tasks current ON current.id = $1
      WHERE candidate.source_node_id = $2
        AND candidate.project_id = $3
        AND candidate.workspace_id = $4
        AND (candidate.created_at, candidate.id) > (current.created_at, current.id)
      LIMIT 1`,
    [task.id, task.source_node_id, task.project_id, task.workspace_id],
  );
  if (newer.length > 0) return false;

  const data = { ...(node.data ?? {}) };
  delete data.status;
  delete data.task_id;
  if (task.status === 'succeeded') {
    if (task.output_asset_ids?.[0]) data.output_asset_id = task.output_asset_ids[0];
    if (task.text_output != null) data.output_text = task.text_output;
    data.output_task_id = task.id;
    delete data.last_error;
  } else if (task.status === 'failed') {
    data.last_error = task.error?.message ?? 'task failed';
  } else if (task.status !== 'cancelled') {
    return false;
  }

  await manager.update(
    CanvasNode,
    { id: node.id, canvas_id: node.canvas_id },
    { data: data as never },
  );
  await manager.query(
    `UPDATE canvas.canvases
        SET version = version + 1, last_modified_by = $1, updated_at = NOW()
      WHERE id = $2`,
    [task.owner_id, node.canvas_id],
  );
  return true;
}
