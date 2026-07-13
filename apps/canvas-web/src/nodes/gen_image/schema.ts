import type { NodeSchema } from '../types';
import { mapImageReferences } from '../_shared/generation-input';
import { collectNodeParams } from '../_shared/task-params';

export interface GenImageData {
  mode: 'text_to_image' | 'image_to_image';
  prompt: string;
  model_id: string | null;
  aspect_ratio: string;
  resolution: string;
}

export const genImageSchema: NodeSchema<GenImageData> = {
  type: 'gen_image',
  title: '图片生成',
  category: 'generation',
  inputs: [
    { id: 'prompt', type: 'text', label: 'prompt' },
    { id: 'reference', type: 'image_list', label: 'ref' },
    { id: 'mask', type: 'mask', label: 'mask', required: false },
    { id: 'style', type: 'style_token', label: 'style', required: false },
  ],
  outputs: [{ id: 'out', type: 'image' }],
  defaultData: { mode: 'text_to_image', prompt: '', model_id: null, aspect_ratio: '1:1', resolution: '1k' },
  form: {
    taskType: 'gen.image',
    modes: [
      { id: 'text_to_image', label: '文生图' },
      { id: 'image_to_image', label: '图生图', requires: ['reference'] },
    ],
    referenceSlots: [
      { port: 'reference', slot: 'source_image', label: '参考图', accept: 'image_list', type: 'image_list' },
      { port: 'mask', slot: 'mask', label: '蒙版', accept: 'mask', type: 'mask', advanced: true },
    ],
    prompt: { field: 'prompt', placeholder: '输入画面想法或上传参考，@引用素材', mention: true },
    cost: true,
    submit: { label: '生成' },
  },
  pillActions: [
    { id: 'regenerate', label: '重新生成', icon: '↻' },
    { id: 'outpaint', label: '扩图', icon: '⤢' },
    { id: 'bg_remove', label: '抠图', icon: '✂' },
    { id: 'upscale', label: '高清化', icon: '⬆' },
    { id: 'edit', label: '编辑/重绘', icon: '✎' },
  ],
  agentSuggestions: ['把光线调暗一点', '换成赛博朋克风格', '把视角拉远一些'],
  agentContext(data) {
    return `这是一个图片生成节点。prompt: "${data.prompt}"，模型: ${data.model_id ?? '未指定'}，比例 ${data.aspect_ratio}，分辨率 ${data.resolution}。`;
  },
  buildTaskBody(data, upstream) {
    const inputs: Record<string, unknown> = {
      mode: data.mode,
      prompt: upstream.prompt ?? data.prompt,
      references: mapImageReferences(data.mode, upstream.references),
    };
    const params = collectNodeParams(data as unknown as Record<string, unknown>, {
      aspect_ratio: data.aspect_ratio,
      resolution: data.resolution,
    });
    return {
      task_type: 'gen.image',
      model_id: data.model_id ?? 'doubao:seedream-image',
      params,
      inputs,
    };
  },
};
