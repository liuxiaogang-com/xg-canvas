import type { ComponentType } from 'react';

import EntityCharacterNode from './entity_character';
import EntitySceneNode from './entity_scene';
import EntityPropNode from './entity_prop';
import { entityCharacterSchema, entitySceneSchema, entityPropSchema } from './_shared/entity-schemas';
import { AssetInputNode, assetInputSchema } from './asset_input';
import { AudioTranscribeNode, audioTranscribeSchema } from './audio_transcribe';
import { GenAudioNode, genAudioSchema } from './gen_audio';
import { GenImageNode, genImageSchema } from './gen_image';
import { GenTextNode } from './gen_text';
import { genTextSchema } from './gen_text/schema';
import { GenVideoNode, genVideoSchema } from './gen_video';
import { GridNode, gridSchema } from './grid';
import GroupNode from './group/GroupNode';
import { ScriptInputNode, scriptInputSchema } from './script_input';
import { StoryboardShotNode, storyboardShotSchema } from './storyboard_shot';
import type { NodeSchema } from './types';

export interface RegistryEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: NodeSchema<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
}

/**
 * Full runtime registry — keep every known type registered so existing canvases
 * still render / reconnect. Do NOT delete entries when hiding from the menu.
 */
export const NODE_REGISTRY: Record<string, RegistryEntry> = {
  // Input / media
  asset_input: { schema: assetInputSchema, component: AssetInputNode },
  // M3 generation nodes
  gen_text: { schema: genTextSchema, component: GenTextNode },
  gen_image: { schema: genImageSchema, component: GenImageNode },
  gen_video: { schema: genVideoSchema, component: GenVideoNode },
  gen_audio: { schema: genAudioSchema, component: GenAudioNode },
  audio_transcribe: { schema: audioTranscribeSchema, component: AudioTranscribeNode },
  // M4 storyboard pipeline
  script_input: { schema: scriptInputSchema, component: ScriptInputNode },
  entity_character: { schema: entityCharacterSchema, component: EntityCharacterNode },
  entity_scene: { schema: entitySceneSchema, component: EntitySceneNode },
  entity_prop: { schema: entityPropSchema, component: EntityPropNode },
  storyboard_shot: { schema: storyboardShotSchema, component: StoryboardShotNode },
  grid: { schema: gridSchema, component: GridNode },
};

/**
 * Types shown in the add-node menu (CanvasDock / PaneContextMenu / LeftDock)
 * and in drag-to-create candidate lists. Order = menu order.
 *
 * Temporarily omitted (re-enable when ready — do NOT delete the registry entries):
 * - gen_text          — 文本生成交互与结果链路未理顺，暂不开放新建
 * - gen_audio         — 音频生成交互与模型能力未收口，暂不开放新建
 * - audio_transcribe  — 语音识别链路未完成，暂不开放新建
 * - script_input      — 脚本提取 / 分镜流水线未完成，暂不开放新建
 * - entity_character  — 角色实体节点依赖脚本流水线，暂不开放新建
 * - entity_scene      — 场景实体节点依赖脚本流水线，暂不开放新建
 * - entity_prop       — 物品实体节点依赖脚本流水线，暂不开放新建
 * - storyboard_shot   — 分镜节点与表格视图未完成，暂不开放新建
 * - grid              — 宫格编排交互未完成，暂不开放新建
 */
const PALETTE_TYPES: readonly string[] = [
  'asset_input',
  // 'gen_text',         // 文本生成交互与结果链路未理顺，暂不开放新建
  'gen_image',
  'gen_video',
  // 'gen_audio',        // 音频生成交互与模型能力未收口，暂不开放新建
  // 'audio_transcribe', // 语音识别链路未完成，暂不开放新建
  // 'script_input',     // 脚本提取 / 分镜流水线未完成，暂不开放新建
  // 'entity_character', // 角色实体节点依赖脚本流水线，暂不开放新建
  // 'entity_scene',     // 场景实体节点依赖脚本流水线，暂不开放新建
  // 'entity_prop',      // 物品实体节点依赖脚本流水线，暂不开放新建
  // 'storyboard_shot',  // 分镜节点与表格视图未完成，暂不开放新建
  // 'grid',             // 宫格编排交互未完成，暂不开放新建
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSchema(type: string): NodeSchema<any> | null {
  return NODE_REGISTRY[type]?.schema ?? null;
}

export const NODE_TYPE_COMPONENTS = {
  ...Object.fromEntries(Object.entries(NODE_REGISTRY).map(([k, v]) => [k, v.component])),
  // group is a structural container — no schema, not in the palette.
  group: GroupNode,
};

export const PALETTE = PALETTE_TYPES.filter((type) => NODE_REGISTRY[type]).map((type) => {
  const e = NODE_REGISTRY[type]!;
  return { type: e.schema.type, title: e.schema.title, category: e.schema.category };
});

/** Whether a node type is offered in the add-node / drag-to-create menus. */
export function isPaletteType(type: string): boolean {
  return PALETTE_TYPES.includes(type);
}
