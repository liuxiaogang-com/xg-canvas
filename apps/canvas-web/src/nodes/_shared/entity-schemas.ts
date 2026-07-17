import type { NodeSchema } from '../types';
import { requireSelectedModel } from './model-selection';

export interface EntityNodeData {
  name: string;
  description: string;
  ref_asset_ids: string[];
  model_id: string | null;
}

const baseDefault: EntityNodeData = {
  name: '',
  description: '',
  ref_asset_ids: [],
  model_id: null,
};

function makeSchema(
  type: string,
  title: string,
  kind: 'character' | 'scene' | 'prop',
): NodeSchema<EntityNodeData> {
  return {
    type,
    title,
    category: 'entity',
    inputs: [{ id: 'reference', type: 'image_list', label: 'ref', required: false }],
    outputs: [
      { id: 'ref', type: 'entity_ref', entityKind: kind },
      { id: 'image', type: 'image' },
    ],
    defaultData: { ...baseDefault },
    form: {
      taskType: 'gen.image',
      prompt: { field: 'description', placeholder: `描述${title.replace('节点', '')}外观`, mention: true },
      cost: true,
      submit: { label: '生成效果图' },
    },
    pillActions: [
      { id: 'generate_image', label: '生成效果图', icon: '✨' },
      { id: 'rename', label: '改名', icon: '✎' },
    ],
    agentSuggestions: [`给 ${title.replace('节点', '')} 写更详细的描述`, '生成 3 个备选效果图'],
    agentContext(data) {
      return `这是一个${title}。name: "${data.name}"，description: "${data.description}"。`;
    },
    buildTaskBody(data) {
      return {
        task_type: 'gen.image',
        model_id: requireSelectedModel(data.model_id),
        params: { aspect_ratio: '1:1', resolution: '1k' },
        inputs: { mode: 'text_to_image', prompt: `${data.name} — ${data.description}`, references: [] },
      };
    },
  };
}

export const entityCharacterSchema = makeSchema('entity_character', '角色节点', 'character');
export const entitySceneSchema = makeSchema('entity_scene', '场景节点', 'scene');
export const entityPropSchema = makeSchema('entity_prop', '物品节点', 'prop');
