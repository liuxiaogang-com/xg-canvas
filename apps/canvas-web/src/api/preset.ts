import { api } from './client';

export interface PresetSegment {
  role: 'system' | 'user' | 'assistant';
  text: string;
}

export interface Preset {
  id: string;
  scope: 'system' | 'user';
  task_type: string;
  title: string;
  content: PresetSegment[];
  tags: string[];
  enabled: boolean;
}

export const presetApi = {
  list: (taskType?: string) =>
    api<Preset[]>(`/presets${taskType ? `?task_type=${encodeURIComponent(taskType)}` : ''}`),
  create: (body: { task_type: string; title: string; content: PresetSegment[]; tags?: string[] }) =>
    api<Preset>('/presets', { method: 'POST', body }),
  update: (id: string, body: Partial<Preset>) =>
    api<Preset>(`/presets/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api<void>(`/presets/${id}`, { method: 'DELETE' }),
};
