import { describe, it, expect } from 'vitest';
import { evaluateConstraints, reconcileParams } from '../engine';
import type { ModelParamSchema, ParamConstraint } from '../types';

// ============================================================
// 测试用 Schema：模拟豆包 Seedance 视频生成
// ============================================================
const seedanceSchema: ModelParamSchema = {
  version: '1.0',
  groups: [
    { id: 'input', label: '输入', fields: ['prompt'] },
    { id: 'mode', label: '模式', fields: ['generation_mode'] },
    { id: 'reference', label: '参考', fields: ['first_frame', 'last_frame', 'reference_image'] },
    { id: 'generation', label: '生成设置', fields: ['aspect_ratio', 'duration'] },
    { id: 'advanced', label: '高级', fields: ['seed'], collapsed: true },
  ],
  properties: {
    prompt: {
      type: 'text',
      label: '提示词',
      max_length: 2000,
    },
    generation_mode: {
      type: 'enum',
      label: '生成模式',
      enum_options: [
        { value: 'text_only', label: '纯文本' },
        { value: 'first_frame', label: '首帧' },
        { value: 'first_last_frame', label: '首尾帧' },
        { value: 'reference', label: '参考图' },
      ],
      default: 'text_only',
    },
    first_frame: {
      type: 'file',
      label: '首帧图片',
      accept: ['image/png', 'image/jpeg'],
      visible_when: { field: 'generation_mode', op: 'in', value: ['first_frame', 'first_last_frame'] },
    },
    last_frame: {
      type: 'file',
      label: '尾帧图片',
      accept: ['image/png', 'image/jpeg'],
      visible_when: { field: 'generation_mode', op: 'eq', value: 'first_last_frame' },
    },
    reference_image: {
      type: 'file',
      label: '参考图',
      visible_when: { field: 'generation_mode', op: 'eq', value: 'reference' },
    },
    aspect_ratio: {
      type: 'enum',
      label: '宽高比',
      enum_options: [
        { value: '16:9', label: '16:9 横屏' },
        { value: '9:16', label: '9:16 竖屏' },
        { value: '1:1', label: '1:1 方形' },
        { value: '4:3', label: '4:3' },
        { value: '3:4', label: '3:4' },
      ],
      default: '16:9',
    },
    duration: {
      type: 'enum',
      label: '时长',
      enum_options: [
        { value: 5, label: '5 秒' },
        { value: 10, label: '10 秒' },
      ],
      default: 5,
    },
    seed: {
      type: 'integer',
      label: '随机种子',
      min: -1,
      max: 2147483647,
      default: -1,
      ui_hidden: true,
    },
  },
  required: ['prompt', 'generation_mode'],
  defaults: {
    generation_mode: 'text_only',
    aspect_ratio: '16:9',
    duration: 5,
    seed: -1,
  },
};

const seedanceConstraints: ParamConstraint[] = [
  {
    id: 'first_last_frame_aspect',
    description: '首尾帧模式宽高比受限',
    when: { field: 'generation_mode', op: 'eq', value: 'first_last_frame' },
    actions: [
      { type: 'restrict_options', target: 'aspect_ratio', allowed_values: ['16:9', '9:16'] },
      { type: 'set_required', target: 'first_frame', required: true },
    ],
  },
  {
    id: 'first_frame_required',
    description: '首帧模式首帧必填',
    when: { field: 'generation_mode', op: 'eq', value: 'first_frame' },
    actions: [
      { type: 'set_required', target: 'first_frame', required: true },
    ],
  },
];

describe('evaluateConstraints', () => {
  it('纯文本模式：参考素材全部隐藏', () => {
    const values = { prompt: '一只猫', generation_mode: 'text_only', aspect_ratio: '16:9' };
    const states = evaluateConstraints(values, seedanceSchema, seedanceConstraints);

    expect(states.first_frame.visible).toBe(false);
    expect(states.last_frame.visible).toBe(false);
    expect(states.reference_image.visible).toBe(false);
    expect(states.aspect_ratio.visible).toBe(true);
    // 所有宽高比选项可用
    expect(states.aspect_ratio.available_options).toHaveLength(5);
  });

  it('首帧模式：显示首帧（必填），隐藏尾帧和参考图', () => {
    const values = { prompt: '一只猫', generation_mode: 'first_frame', aspect_ratio: '16:9' };
    const states = evaluateConstraints(values, seedanceSchema, seedanceConstraints);

    expect(states.first_frame.visible).toBe(true);
    expect(states.first_frame.required).toBe(true);
    expect(states.last_frame.visible).toBe(false);
    expect(states.reference_image.visible).toBe(false);
    // 所有宽高比选项可用
    expect(states.aspect_ratio.available_options).toHaveLength(5);
  });

  it('首尾帧模式：宽高比受限为 16:9 和 9:16，首帧必填', () => {
    const values = { prompt: '一只猫', generation_mode: 'first_last_frame', aspect_ratio: '16:9' };
    const states = evaluateConstraints(values, seedanceSchema, seedanceConstraints);

    expect(states.first_frame.visible).toBe(true);
    expect(states.first_frame.required).toBe(true);
    expect(states.last_frame.visible).toBe(true);
    expect(states.reference_image.visible).toBe(false);

    // 宽高比只有 2 个选项
    expect(states.aspect_ratio.available_options).toHaveLength(2);
    const ratioValues = states.aspect_ratio.available_options!.map((o) => o.value);
    expect(ratioValues).toContain('16:9');
    expect(ratioValues).toContain('9:16');
    expect(ratioValues).not.toContain('1:1');
  });

  it('参考图模式：只显示参考图，其他隐藏', () => {
    const values = { prompt: '一只猫', generation_mode: 'reference' };
    const states = evaluateConstraints(values, seedanceSchema, seedanceConstraints);

    expect(states.first_frame.visible).toBe(false);
    expect(states.last_frame.visible).toBe(false);
    expect(states.reference_image.visible).toBe(true);
  });

  it('seed 默认 ui_hidden=true', () => {
    const values = { prompt: '一只猫', generation_mode: 'text_only' };
    const states = evaluateConstraints(values, seedanceSchema, seedanceConstraints);

    expect(states.seed.visible).toBe(false);
  });

  it('初始 required 来自 schema.required', () => {
    const values = { prompt: '一只猫', generation_mode: 'text_only' };
    const states = evaluateConstraints(values, seedanceSchema, seedanceConstraints);

    expect(states.prompt.required).toBe(true);
    expect(states.generation_mode.required).toBe(true);
    expect(states.first_frame.required).toBe(false);
  });
});

describe('reconcileParams', () => {
  it('填充缺失参数的默认值', () => {
    const saved = { prompt: '一只猫', generation_mode: 'text_only' };
    const result = reconcileParams(saved, seedanceSchema);

    expect(result.prompt).toBe('一只猫');
    expect(result.generation_mode).toBe('text_only');
    expect(result.aspect_ratio).toBe('16:9');
    expect(result.duration).toBe(5);
    expect(result.seed).toBe(-1);
  });

  it('保留合法的已保存值', () => {
    const saved = { prompt: '一只猫', generation_mode: 'first_frame', aspect_ratio: '9:16', duration: 10 };
    const result = reconcileParams(saved, seedanceSchema);

    expect(result.generation_mode).toBe('first_frame');
    expect(result.aspect_ratio).toBe('9:16');
    expect(result.duration).toBe(10);
  });

  it('无效的枚举值回退到默认值', () => {
    const saved = { prompt: '一只猫', generation_mode: 'invalid_mode', aspect_ratio: '3:2' };
    const result = reconcileParams(saved, seedanceSchema);

    expect(result.generation_mode).toBe('text_only');
    expect(result.aspect_ratio).toBe('16:9');
  });

  it('忽略 Schema 中已移除的旧参数', () => {
    const saved = { prompt: '一只猫', generation_mode: 'text_only', old_param: 'should_be_ignored' };
    const result = reconcileParams(saved, seedanceSchema);

    expect(result).not.toHaveProperty('old_param');
  });
});
