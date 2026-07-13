import type { NodeSchema } from '../types';

export interface GenTextData {
  prompt: string;
  model_id: string | null;
  temperature: number;
  max_tokens: number;
}

export const genTextSchema: NodeSchema<GenTextData> = {
  type: 'gen_text',
  title: '文本生成',
  category: 'generation',
  inputs: [
    { id: 'prompt', type: 'text', label: 'prompt' },
    { id: 'system', type: 'json', label: 'system', required: false },
  ],
  outputs: [{ id: 'out', type: 'text' }],
  defaultData: { prompt: '', model_id: null, temperature: 0.7, max_tokens: 1024 },
  form: {
    taskType: 'gen.text',
    prompt: { field: 'prompt', placeholder: '输入想法、剧本或上下文，@引用素材', mention: true },
    cost: true,
    submit: { label: '生成' },
  },
  pillActions: [
    { id: 'rewrite', label: '改写', icon: '✎' },
    { id: 'translate', label: '翻译', icon: '⇄' },
    { id: 'summarize', label: '摘要', icon: '∑' },
    { id: 'regenerate', label: '重新生成', icon: '↻' },
  ],
  agentSuggestions: ['让语气更专业', '改成中英对照', '生成 3 个备选版本'],
  agentContext(data) {
    return `这是一个文本生成节点。当前 prompt: "${data.prompt}"，模型: ${data.model_id ?? '未指定'}，temperature=${data.temperature}。`;
  },
  buildTaskBody(data, upstream) {
    return {
      task_type: 'gen.text',
      model_id: data.model_id ?? 'openai:gpt-4o-mini',
      params: { temperature: data.temperature, max_tokens: data.max_tokens },
      inputs: {
        prompt: upstream.prompt ?? data.prompt,
      },
    };
  },
};
