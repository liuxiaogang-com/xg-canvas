import { api } from './client';

export interface AssetRecord {
  id: string;
  type: 'image' | 'video' | 'audio' | 'text' | 'json';
  scope: 'workspace' | 'project';
  visibility: 'private' | 'project' | 'workspace';
  workspace_id: string;
  project_id: string | null;
  task_id: string | null;
  storage_key: string;
  thumb_storage_key: string | null;
  bucket: string;
  mime_type: string;
  bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  name: string | null;
  tags: string[];
  role: string | null;
  created_at: string;
}

export type AssetUrlVariant = 'full' | 'thumb';

export const assetApi = {
  list: (params: {
    project_id?: string | 'global';
    type?: AssetRecord['type'];
    limit?: number;
    before?: string;
    owner?: 'me';
    favorited?: boolean;
    tags?: string;
    source?: 'upload' | 'task';
    q?: string;
  } = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.append(k, String(v)));
    return api<AssetRecord[]>(`/assets?${q.toString()}`);
  },
  detail: (id: string) => api<AssetRecord>(`/assets/${id}`),
  url: (id: string, ttl?: number, variant: AssetUrlVariant = 'full') => {
    const q = new URLSearchParams();
    if (ttl) q.set('ttl', String(ttl));
    if (variant !== 'full') q.set('variant', variant);
    const qs = q.toString();
    return api<{ url: string; expires_in: number; variant?: AssetUrlVariant }>(
      `/assets/${id}/url${qs ? `?${qs}` : ''}`,
    );
  },
  thumbnailIntent: (id: string) =>
    api<{ thumb_upload_url: string; expires_in: number }>(`/assets/${id}/thumbnail-intent`, {
      method: 'POST',
      body: {},
    }),
  thumbnailComplete: (id: string) =>
    api<AssetRecord>(`/assets/${id}/thumbnail-complete`, { method: 'POST', body: {} }),
  copyToProject: (id: string, projectId: string) =>
    api<AssetRecord>(`/assets/${id}/copy-to-project`, { method: 'POST', body: { project_id: projectId } }),
  remove: (id: string) => api<void>(`/assets/${id}`, { method: 'DELETE' }),
  batchUrls: (ids: string[], ttl?: number) =>
    api<{ urls: Record<string, string>; expires_in: number }>(`/assets/urls`, {
      method: 'POST',
      body: { ids, ...(ttl ? { ttl } : {}) },
    }),
  uploadIntent: (input: {
    type: AssetRecord['type'];
    mime_type: string;
    bytes: number;
    name?: string;
    project_id?: string;
    visibility?: AssetRecord['visibility'];
    with_thumbnail?: boolean;
  }) =>
    api<{ draft_id: string; upload_url: string; thumb_upload_url?: string; expires_in: number }>(
      '/assets/upload-intent',
      { method: 'POST', body: input },
    ),
  completeUpload: (
    draftId: string,
    input: { width?: number; height?: number; duration_ms?: number; has_thumbnail?: boolean } = {},
  ) => api<AssetRecord>(`/assets/uploads/${draftId}/complete`, { method: 'POST', body: input }),
};
