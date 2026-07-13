import { api } from './client';

interface BaseScriptInput {
  project_id: string;
  script_node_id: string;
  raw_text: string;
  model_id?: string;
}

export const scriptApi = {
  optimize: (body: BaseScriptInput) =>
    api<{ optimized_text: string }>('/script/optimize', { method: 'POST', body }),
  extractCharacters: (body: BaseScriptInput) =>
    api<{ created_node_ids: string[] }>('/script/extract-characters', { method: 'POST', body }),
  extractScenes: (body: BaseScriptInput) =>
    api<{ created_node_ids: string[] }>('/script/extract-scenes', { method: 'POST', body }),
  extractProps: (body: BaseScriptInput) =>
    api<{ created_node_ids: string[] }>('/script/extract-props', { method: 'POST', body }),
  generateStoryboard: (body: BaseScriptInput) =>
    api<{ created_node_ids: string[] }>('/script/generate-storyboard', { method: 'POST', body }),
};
