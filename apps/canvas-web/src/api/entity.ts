import { api } from './client';

export interface EntityRecord {
  id: string;
  project_id: string;
  type: 'character' | 'scene' | 'prop' | 'storyboard';
  name: string;
  description: string | null;
  ref_asset_ids: string[];
  generated_asset_id: string | null;
  /** Linked reusable library entry (e.g. character library), or null. */
  library_entry_id: string | null;
  data: Record<string, unknown>;
}

export const entityApi = {
  list: (projectId: string, type?: EntityRecord['type']) =>
    api<EntityRecord[]>(`/entities?project_id=${projectId}${type ? `&type=${type}` : ''}`),
  create: (body: { project_id: string; type: EntityRecord['type']; name: string; description?: string }) =>
    api<EntityRecord>('/entities', { method: 'POST', body }),
  update: (id: string, body: Partial<EntityRecord>) =>
    api<EntityRecord>(`/entities/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api<void>(`/entities/${id}`, { method: 'DELETE' }),
};
