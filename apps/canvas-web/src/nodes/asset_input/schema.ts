import type { NodeSchema } from '../types';

export type AssetMediaType = 'image' | 'video' | 'audio';

export const TITLE_BY_MEDIA: Record<AssetMediaType, string> = {
  image: '图片素材',
  video: '视频素材',
  audio: '音频素材',
};

export function titleForMedia(media: AssetMediaType | null | undefined): string {
  return media ? TITLE_BY_MEDIA[media] : '上传素材';
}

export interface AssetInputData {
  /** Media kind; null until a file is uploaded. Drives dynamic output port type. */
  media_type: AssetMediaType | null;
  asset_name?: string;
  /** Intrinsic media size (not the node shell width — that stays on data.width via WidthResizer). */
  media_width?: number;
  media_height?: number;
  duration_ms?: number;
}

export const assetInputSchema: NodeSchema<AssetInputData> = {
  type: 'asset_input',
  title: '上传素材',
  category: 'input',
  inputs: [],
  // Static fallback; runtime type comes from data.media_type via outputTypeOf.
  outputs: [{ id: 'out', type: 'image' }],
  defaultData: { media_type: null },
  pillActions: [],
  agentSuggestions: ['把这个素材接到图片生成当参考'],
  agentContext(data) {
    if (!data.media_type) return '这是一个空的素材节点，尚未上传文件。';
    const name = data.asset_name ? `（${data.asset_name}）` : '';
    return `这是一个${titleForMedia(data.media_type)}${name}，仅作展示与参考，不触发生成。`;
  },
  buildTaskBody() {
    // Asset nodes never submit generation tasks.
    return {
      task_type: 'gen.image',
      model_id: '',
      params: {},
      inputs: {},
    };
  },
};
