import type { NodeSchema } from '../types';

export interface AudioTranscribeData {
  model_id: string | null;
  language: string;
  output_text?: string;
  status?: string;
}

export const audioTranscribeSchema: NodeSchema<AudioTranscribeData> = {
  type: 'audio_transcribe',
  title: '语音识别',
  category: 'generation',
  inputs: [{ id: 'audio', type: 'audio', label: '音频' }],
  outputs: [{ id: 'out', type: 'text' }],
  defaultData: { model_id: null, language: 'zh' },
  pillActions: [
    { id: 'regenerate', label: '重新识别', icon: '↻' },
  ],
  agentSuggestions: ['切换到英文识别', '提取关键词'],
  agentContext(data) {
    return `这是一个语音识别节点。语言: ${data.language}，模型: ${data.model_id ?? '未指定'}。`;
  },
  buildTaskBody(data, upstream) {
    const audio = upstream.references?.find((r) => r.type === 'audio' || r.slot === 'driving_audio');
    return {
      task_type: 'audio.transcribe',
      model_id: data.model_id ?? 'openai:whisper-1',
      params: { language: data.language },
      inputs: { audio_url: audio?.asset_id },
    };
  },
};
