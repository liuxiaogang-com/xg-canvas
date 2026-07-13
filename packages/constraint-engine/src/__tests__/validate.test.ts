import { describe, it, expect } from 'vitest';
import { validateParams } from '../validate';
import type { ModelParamSchema, ParamConstraint } from '../types';

const schema: ModelParamSchema = {
  version: '1.0',
  groups: [
    { id: 'input', label: '输入', fields: ['prompt'] },
    { id: 'params', label: '参数', fields: ['temperature', 'style', 'count'] },
  ],
  properties: {
    prompt: {
      type: 'text',
      label: '提示词',
      max_length: 100,
    },
    temperature: {
      type: 'number',
      label: '温度',
      min: 0,
      max: 2,
      step: 0.1,
      default: 0.7,
    },
    style: {
      type: 'enum',
      label: '风格',
      enum_options: [
        { value: 'natural', label: '自然' },
        { value: 'vivid', label: '鲜明' },
        { value: 'anime', label: '动漫' },
      ],
      default: 'natural',
    },
    count: {
      type: 'integer',
      label: '数量',
      min: 1,
      max: 10,
      default: 1,
    },
  },
  required: ['prompt'],
  defaults: {
    temperature: 0.7,
    style: 'natural',
    count: 1,
  },
};

const constraints: ParamConstraint[] = [];

describe('validateParams', () => {
  it('合法参数通过校验', () => {
    const result = validateParams(
      { prompt: 'hello', temperature: 0.5, style: 'vivid', count: 3 },
      schema,
      constraints
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('必填项缺失报错', () => {
    const result = validateParams({}, schema, constraints);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'prompt')).toBe(true);
  });

  it('必填项为空字符串报错', () => {
    const result = validateParams({ prompt: '' }, schema, constraints);
    expect(result.valid).toBe(false);
  });

  it('缺失参数用默认值填充', () => {
    const result = validateParams({ prompt: 'hello' }, schema, constraints);
    expect(result.valid).toBe(true);
    expect(result.resolved_params.temperature).toBe(0.7);
    expect(result.resolved_params.style).toBe('natural');
    expect(result.resolved_params.count).toBe(1);
  });

  it('数值超出范围报错', () => {
    const result = validateParams(
      { prompt: 'hello', temperature: 5 },
      schema,
      constraints
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'temperature')).toBe(true);
  });

  it('无效枚举值报错', () => {
    const result = validateParams(
      { prompt: 'hello', style: 'invalid_style' },
      schema,
      constraints
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'style')).toBe(true);
  });

  it('整数字段传入浮点数报错', () => {
    const result = validateParams(
      { prompt: 'hello', count: 3.5 },
      schema,
      constraints
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'count')).toBe(true);
  });

  it('文本超过 max_length 报错', () => {
    const result = validateParams(
      { prompt: 'a'.repeat(101) },
      schema,
      constraints
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'prompt')).toBe(true);
  });
});

describe('validateParams with constraints', () => {
  const schemaWithMode: ModelParamSchema = {
    version: '1.0',
    groups: [
      { id: 'input', label: '输入', fields: ['prompt', 'mode', 'ratio'] },
    ],
    properties: {
      prompt: { type: 'text', label: '提示词' },
      mode: {
        type: 'enum',
        label: '模式',
        enum_options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
        default: 'a',
      },
      ratio: {
        type: 'enum',
        label: '比例',
        enum_options: [
          { value: '16:9', label: '16:9' },
          { value: '9:16', label: '9:16' },
          { value: '1:1', label: '1:1' },
        ],
        default: '16:9',
      },
    },
    required: ['prompt', 'mode'],
    defaults: { mode: 'a', ratio: '16:9' },
  };

  const modeConstraints: ParamConstraint[] = [
    {
      id: 'mode_b_ratio',
      when: { field: 'mode', op: 'eq', value: 'b' },
      actions: [
        { type: 'restrict_options', target: 'ratio', allowed_values: ['16:9', '9:16'] },
      ],
    },
  ];

  it('约束生效时，受限枚举值外的值报错', () => {
    const result = validateParams(
      { prompt: 'hi', mode: 'b', ratio: '1:1' },
      schemaWithMode,
      modeConstraints
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'ratio')).toBe(true);
  });

  it('约束生效时，受限范围内的值通过', () => {
    const result = validateParams(
      { prompt: 'hi', mode: 'b', ratio: '16:9' },
      schemaWithMode,
      modeConstraints
    );
    expect(result.valid).toBe(true);
  });

  it('约束不生效时，所有枚举值都合法', () => {
    const result = validateParams(
      { prompt: 'hi', mode: 'a', ratio: '1:1' },
      schemaWithMode,
      modeConstraints
    );
    expect(result.valid).toBe(true);
  });
});
