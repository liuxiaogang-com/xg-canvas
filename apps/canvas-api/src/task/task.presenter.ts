import type { Task } from '../database/entities';

/** Public task shape. Catalog pins, credentials, leases and vendor routing stay server-only. */
export interface PublicTask {
  id: string;
  type: Task['type'];
  status: Task['status'];
  model_id: string;
  project_id: string | null;
  source_node_id: string | null;
  workspace_id: string;
  params: Record<string, unknown>;
  inputs: Record<string, unknown>;
  output_asset_ids: string[];
  text_output: string | null;
  json_output: unknown;
  progress: number | null;
  error: { code: string; message: string } | null;
  created_at: Date;
  updated_at: Date;
  finished_at: Date | null;
}

export function presentTask(task: Task): PublicTask {
  return {
    id: task.id,
    type: task.type,
    status: task.status,
    model_id: task.model_id,
    project_id: task.project_id,
    source_node_id: task.source_node_id,
    workspace_id: task.workspace_id,
    params: task.params,
    inputs: task.inputs,
    output_asset_ids: task.output_asset_ids,
    text_output: task.text_output,
    json_output: task.json_output,
    progress: task.progress,
    error: task.error ? { code: task.error.code, message: task.error.message } : null,
    created_at: task.created_at,
    updated_at: task.updated_at,
    finished_at: task.finished_at,
  };
}
