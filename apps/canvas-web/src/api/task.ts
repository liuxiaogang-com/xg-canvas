import { api } from './client';

export type TaskStatus = 'pending' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface TaskRecord {
  id: string;
  type: string;
  status: TaskStatus;
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
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export const taskApi = {
  create: (body: {
    task_type: string;
    model_id: string;
    params: Record<string, unknown>;
    inputs?: Record<string, unknown>;
    project_id?: string;
    source_node_id?: string;
  }) => api<TaskRecord>('/tasks', { method: 'POST', body }),

  list: (params: {
    status?: TaskStatus;
    project_id?: string;
    standalone?: boolean;
    active?: boolean;
    limit?: number;
    before?: string;
  } = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.append(k, String(v)));
    return api<TaskRecord[]>(`/tasks?${q.toString()}`);
  },

  detail: (id: string, signal?: AbortSignal) => api<TaskRecord>(`/tasks/${id}`, { signal }),
  cancel: (id: string) => api<TaskRecord>(`/tasks/${id}/cancel`, { method: 'POST' }),
  retry: (id: string) => api<TaskRecord>(`/tasks/${id}/retry`, { method: 'POST' }),
};
