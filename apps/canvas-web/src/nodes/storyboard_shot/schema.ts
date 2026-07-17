import type { NodeSchema } from '../types';
import { mapImageReferences, mapVideoReferences } from '../_shared/generation-input';
import { requireSelectedModel } from '../_shared/model-selection';

export interface StoryboardShotData {
  shot_no: number;
  summary: string;
  dialogue: string;
  prompt: string;
  duration_sec: number;
  target: 'image' | 'video';
  model_id: string | null;
}

export const storyboardShotSchema: NodeSchema<StoryboardShotData> = {
  type: 'storyboard_shot',
  title: '分镜节点',
  category: 'compose',
  inputs: [
    { id: 'characters', type: 'entity_ref', entityKind: 'character', required: false },
    { id: 'scene', type: 'entity_ref', entityKind: 'scene', required: false },
    { id: 'props', type: 'entity_ref', entityKind: 'prop', required: false },
    { id: 'reference', type: 'image_list', required: false },
  ],
  outputs: [
    { id: 'storyboard_ref', type: 'entity_ref', entityKind: 'storyboard' },
    { id: 'image', type: 'image' },
    { id: 'video', type: 'video' },
  ],
  defaultData: {
    shot_no: 1,
    summary: '',
    dialogue: '',
    prompt: '',
    duration_sec: 5,
    target: 'image',
    model_id: null,
  },
  form: {
    taskType: (data) => data.target === 'video' ? 'gen.video' : 'gen.image',
    prompt: { field: 'prompt', placeholder: '描述这一镜的画面、动作与运镜', mention: true },
    cost: true,
    submit: { label: '生成' },
  },
  pillActions: [
    { id: 'generate_image', label: '生成图', icon: '🖼' },
    { id: 'generate_video', label: '生成视频', icon: '🎬' },
    { id: 'regenerate', label: '重新生成', icon: '↻' },
  ],
  agentSuggestions: ['运镜放慢', '换一个机位', '把对白改得更克制'],
  agentContext(data) {
    return `这是分镜 #${data.shot_no}。${data.summary}。prompt: "${data.prompt}"，时长 ${data.duration_sec}s。`;
  },
  buildTaskBody(data, upstream) {
    if (data.target === 'video') {
      const mode = upstream.references?.length ? 'image_to_video' : 'text_to_video';
      return {
        task_type: 'gen.video',
        model_id: requireSelectedModel(data.model_id),
        params: { duration_sec: data.duration_sec, aspect_ratio: '16:9' },
        inputs: {
          mode,
          prompt: upstream.prompt ?? data.prompt,
          references: mapVideoReferences(mode, upstream.references),
        },
      };
    }
    const mode = upstream.references?.length ? 'image_to_image' : 'text_to_image';
    return {
      task_type: 'gen.image',
      model_id: requireSelectedModel(data.model_id),
      params: { aspect_ratio: '16:9', resolution: '1k' },
      inputs: {
        mode,
        prompt: upstream.prompt ?? data.prompt,
        references: mapImageReferences(mode, upstream.references),
      },
    };
  },
};
