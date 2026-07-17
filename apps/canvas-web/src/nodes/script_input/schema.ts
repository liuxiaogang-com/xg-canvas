import type { NodeSchema } from '../types';

export interface ScriptInputData {
  raw_text: string;
  optimized_text: string;
  model_id: string | null;
}

export const scriptInputSchema: NodeSchema<ScriptInputData> = {
  type: 'script_input',
  title: '脚本节点',
  category: 'input',
  inputs: [
    { id: 'in_text', type: 'text', required: false },
    { id: 'in_json', type: 'json', required: false },
  ],
  outputs: [
    { id: 'out_text', type: 'text' },
    { id: 'out_json', type: 'json' },
  ],
  defaultData: { raw_text: '', optimized_text: '', model_id: null },
  pillActions: [
    { id: 'optimize', label: '优化文本', icon: '✎' },
    { id: 'extract_characters', label: '提取角色', icon: '👤' },
    { id: 'extract_scenes', label: '提取场景', icon: '🏞' },
    { id: 'extract_props', label: '提取物品', icon: '🎒' },
    { id: 'generate_storyboard', label: '生成分镜', icon: '🎬' },
  ],
  agentSuggestions: ['把这段剧本拆成三幕', '帮我写一个分镜大纲'],
  agentContext(data) {
    return `这是一个脚本节点，原文 ${data.raw_text.length} 字。`;
  },
};
