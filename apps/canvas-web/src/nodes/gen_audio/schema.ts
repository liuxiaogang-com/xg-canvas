import type { NodeSchema } from '../types';
import { requireSelectedModel } from '../_shared/model-selection';

export interface GenAudioData {
  prompt: string;
  model_id: string | null;
  duration_sec: number;
  variant: 'tts' | 'music';
}

export const genAudioSchema: NodeSchema<GenAudioData> = {
  type: 'gen_audio',
  title: '音频生成',
  category: 'generation',
  inputs: [{ id: 'prompt', type: 'text', label: 'prompt' }],
  outputs: [{ id: 'out', type: 'audio' }],
  defaultData: { prompt: '', model_id: null, duration_sec: 30, variant: 'tts' },
  form: {
    taskType: 'gen.audio',
    modes: [
      { id: 'tts', label: '文本转语音' },
      { id: 'music', label: '音乐生成' },
    ],
    modeField: 'variant',
    prompt: { field: 'prompt', placeholder: '输入台词、歌词或音乐想法，@引用素材', mention: true },
    cost: true,
    submit: { label: '生成' },
  },
  pillActions: [
    { id: 'regenerate', label: '重新生成', icon: '↻' },
    { id: 'switch_voice', label: '换嗓音', icon: '♪' },
  ],
  agentSuggestions: ['换成男声', '加快节奏', '更安静的氛围'],
  agentContext(data) {
    return `这是一个音频生成节点(${data.variant})。prompt: "${data.prompt}"，时长 ${data.duration_sec}s。`;
  },
  buildTaskBody(data, upstream) {
    return {
      task_type: 'gen.audio',
      model_id: requireSelectedModel(data.model_id),
      params: { duration_sec: data.duration_sec, variant: data.variant },
      inputs: { mode: 'text_to_audio', prompt: upstream.prompt ?? data.prompt, references: [] },
    };
  },
};
