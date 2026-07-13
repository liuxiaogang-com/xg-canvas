import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

import { CanvasNode, Task } from '../database/entities';

/**
 * Projects a terminal task into its source node inside the caller's database
 * transaction. A newer task for the same node always wins, even if it has not
 * reached a terminal state yet.
 */
@Injectable()
export class TaskNodeWritebackService {
  async applyTerminal(t: Task, manager: EntityManager): Promise<boolean> {
    if (!t.source_node_id || !t.project_id) return false;

    const rows = await manager.query(
      `SELECT n.id, n.canvas_id, n.data
         FROM canvas.canvas_nodes n
         JOIN canvas.canvases c ON c.id = n.canvas_id
         JOIN canvas.projects p ON p.id = c.project_id
        WHERE n.id = $1
          AND p.id = $2
          AND p.workspace_id = $3
        FOR UPDATE OF n`,
      [t.source_node_id, t.project_id, t.workspace_id],
    );
    const node = rows[0] as { id: string; canvas_id: string; data: Record<string, unknown> } | undefined;
    if (!node) return false;

    // This is intentionally a second statement after the node lock. Under
    // READ COMMITTED it gets a fresh snapshot, so a task creator that held the
    // same node lock cannot remain invisible after we finish waiting.
    const newer = await manager.query(
      `SELECT 1
         FROM canvas.tasks candidate
         JOIN canvas.tasks current ON current.id = $1
        WHERE candidate.source_node_id = $2
          AND candidate.project_id = $3
          AND candidate.workspace_id = $4
          AND (candidate.created_at, candidate.id) > (current.created_at, current.id)
        LIMIT 1`,
      [t.id, t.source_node_id, t.project_id, t.workspace_id],
    );
    if (newer.length > 0) return false;

    const data = { ...(node.data ?? {}) };
    delete data.status;
    delete data.task_id;

    if (t.status === 'succeeded') {
      if (t.output_asset_ids?.[0]) data.output_asset_id = t.output_asset_ids[0];
      if (t.text_output != null) data.output_text = t.text_output;
      data.output_task_id = t.id;
      delete data.last_error;
    } else if (t.status === 'failed') {
      data.last_error = t.error?.message ?? 'task failed';
    } else if (t.status !== 'cancelled') {
      return false;
    }

    await manager.update(CanvasNode, { id: node.id, canvas_id: node.canvas_id }, { data: data as never });
    await manager.query(
      `UPDATE canvas.canvases
          SET version = version + 1, last_modified_by = $1, updated_at = NOW()
        WHERE id = $2`,
      [t.owner_id, node.canvas_id],
    );
    return true;
  }
}
