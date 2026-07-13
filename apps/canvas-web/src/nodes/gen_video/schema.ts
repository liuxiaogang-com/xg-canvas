import type { NodeSchema } from '../types';
import { mapVideoReferences } from '../_shared/generation-input';
import { collectNodeParams } from '../_shared/task-params';

type VideoMode =
  | 'text_to_video'
  | 'image_to_video'
  | 'first_last_frame'
  | 'reference_to_video'
  | 'audio_driven_video';

export interface GenVideoData {
  mode: VideoMode;
  prompt: string;
  model_id: string | null;
  duration_sec: number;
  aspect_ratio: string;
}

export const genVideoSchema: NodeSchema<GenVideoData> = {
  type: 'gen_video',
  title: '视频生成',
  category: 'generation',
  inputs: [
    { id: 'prompt', type: 'text', label: 'prompt' },
    { id: 'reference', type: 'image_list', label: 'ref' },
    { id: 'audio_ref', type: 'audio', label: 'audio', required: false },
  ],
  outputs: [{ id: 'out', type: 'video' }],
  defaultData: { mode: 'text_to_video', prompt: '', model_id: null, duration_sec: 5, aspect_ratio: '16:9' },
  form: {
    taskType: 'gen.video',
    modes: [
      { id: 'text_to_video', label: '文生视频' },
      { id: 'image_to_video', label: '图生视频', requires: ['reference'] },
      { id: 'first_last_frame', label: '首尾帧', requires: ['reference'] },
      { id: 'reference_to_video', label: '全能参考', requires: ['reference'] },
      { id: 'audio_driven_video', label: '音频参考', requires: ['reference', 'audio_ref'] },
    ],
    referenceSlots: [
      { port: 'reference', slot: 'reference_image', label: '参考图/首帧', accept: 'image_list', type: 'image_list' },
      { port: 'audio_ref', slot: 'driving_audio', label: '参考音频', accept: 'audio', type: 'audio', advanced: true },
    ],
    prompt: { field: 'prompt', placeholder: '输入想法、剧本或运镜，上传参考或 @引用素材', mention: true },
    cost: true,
    submit: { label: '生成' },
  },
  pillActions: [
    { id: 'regenerate', label: '重新生成', icon: '↻' },
    { id: 'split_shots', label: '切镜', icon: '✂' },
    { id: 'frame_capture', label: '截帧', icon: '⊟' },
    { id: 'upscale', label: '高清化', icon: '⬆' },
  ],
  agentSuggestions: ['延长到 10 秒', '更慢一点的运镜', '加入雨夜氛围'],
  agentContext(data) {
    return `这是一个视频生成节点。prompt: "${data.prompt}"，时长 ${data.duration_sec}s，比例 ${data.aspect_ratio}，模型: ${data.model_id ?? '未指定'}。`;
  },
  buildTaskBody(data, upstream) {
    const inputs: Record<string, unknown> = {
      mode: data.mode,
      prompt: upstream.prompt ?? data.prompt,
      references: mapVideoReferences(data.mode, upstream.references),
    };
    const params = collectNodeParams(data as unknown as Record<string, unknown>, {
      duration_sec: data.duration_sec,
      aspect_ratio: data.aspect_ratio,
    });
    if (params.duration === undefined && typeof data.duration_sec === 'number') {
      params.duration = data.duration_sec;
    }
    if (params.ratio === undefined && typeof data.aspect_ratio === 'string') {
      params.ratio = data.aspect_ratio;
    }
    return {
      task_type: 'gen.video',
      model_id: data.model_id ?? 'doubao:jimeng-video',
      params,
      inputs,
    };
  },
};
