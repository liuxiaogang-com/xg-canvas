import { api } from './client';
import type {
  TaskRecord as SharedTaskRecord,
  TaskStatus as SharedTaskStatus,
  TaskType,
} from '@xgcanvas/shared-types';

export type TaskStatus = SharedTaskStatus;
export type TaskRecord = SharedTaskRecord;

export const taskApi = {
  create: (body: {
    task_type: TaskType;
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
