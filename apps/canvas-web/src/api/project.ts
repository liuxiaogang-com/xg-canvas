import { api } from './client';

export interface ProjectListItem {
  id: string;
  name: string;
  cover_url: string | null;
  description: string | null;
  is_favorite: boolean;
  archived: boolean;
  asset_count: number;
  node_count: number;
  member_count: number;
  updated_at: string;
}

export const projectApi = {
  list: (workspaceId?: string) =>
    api<ProjectListItem[]>(`/projects${workspaceId ? `?workspace_id=${workspaceId}` : ''}`),
  create: (workspaceId: string, name: string, description?: string) =>
    api<ProjectListItem>('/projects', {
      method: 'POST',
      body: { workspace_id: workspaceId, name, description },
    }),
  detail: (id: string) => api<ProjectListItem>(`/projects/${id}`),
  update: (id: string, body: Partial<Pick<ProjectListItem, 'name' | 'description' | 'cover_url' | 'is_favorite' | 'archived'>>) =>
    api<ProjectListItem>(`/projects/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api<void>(`/projects/${id}`, { method: 'DELETE' }),
};
