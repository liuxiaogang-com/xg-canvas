import { Injectable } from '@nestjs/common';
import type { TaskType } from '@xgcanvas/shared-types';

import type {
  CostEstimate,
  ModelPricing,
  ModelSchemaResponse,
  RichModelSummary,
  ValidateParamsResult,
} from './model.types';
import {
  defaultsFromParamSpecs,
  estimateCredits,
  paramSchemaToParamSpecs,
  pricingSummary,
} from './param-schema';

interface DemoProvider {
  key: string;
  display_name: string;
  icon_url: string;
}

const PROVIDERS: Record<string, DemoProvider> = {
  jimeng: { key: 'jimeng', display_name: '即梦 AI', icon_url: '' },
  doubao: { key: 'doubao', display_name: '豆包 · 火山', icon_url: '' },
  openai: { key: 'openai', display_name: 'OpenAI', icon_url: '' },
  minimax: { key: 'minimax', display_name: 'MiniMax', icon_url: '' },
};

interface DemoModel {
  id: string;
  display_name: string;
  description: string;
  provider: string;
  task_types: TaskType[];
  capabilities: string[];
  invocation_mode: 'sync' | 'async' | 'stream';
  supports_streaming: boolean;
  tags: string[];
  param_schema: { properties?: Record<string, unknown> };
  pricing: ModelPricing;
}

const ASPECT = { type: 'string', enum: ['1:1', '16:9', '9:16', '4:3', '3:4'], default: '1:1' };
const BATCH = { type: 'integer', minimum: 1, maximum: 4, default: 1 };

/** Mirrors scripts/seed-demo-data.sql model_definitions so the picker matches seeded history. */
const MODELS: DemoModel[] = [
  {
    id: 'jimeng/text-v1', display_name: '即梦文案助手', description: '中文创意文案 / 广告脚本', provider: 'jimeng',
    task_types: ['gen.text'], capabilities: ['text'], invocation_mode: 'sync', supports_streaming: true, tags: ['推荐'],
    param_schema: { properties: { temperature: { type: 'number', minimum: 0, maximum: 2, default: 0.7 }, max_tokens: { type: 'integer', minimum: 1, maximum: 4096, default: 1024 } } },
    pricing: { unit: 'token', input_price: 0.002, output_price: 0.006, currency: 'CNY' },
  },
  {
    id: 'openai/gpt-4o-mini', display_name: 'GPT-4o mini', description: '通用文本生成', provider: 'openai',
    task_types: ['gen.text'], capabilities: ['text'], invocation_mode: 'sync', supports_streaming: true, tags: [],
    param_schema: { properties: { temperature: { type: 'number', minimum: 0, maximum: 2, default: 0.7 }, max_tokens: { type: 'integer', minimum: 1, maximum: 4096, default: 1024 } } },
    pricing: { unit: 'token', input_price: 0.005, output_price: 0.015, currency: 'CNY' },
  },
  {
    id: 'jimeng/image-v1', display_name: '即梦绘图 XL', description: '高质量中文文生图', provider: 'jimeng',
    task_types: ['gen.image'], capabilities: ['image', 'i2i'], invocation_mode: 'async', supports_streaming: false, tags: ['推荐'],
    param_schema: { properties: { aspect_ratio: ASPECT, resolution: { type: 'string', enum: ['512', '1k', '2k'], default: '1k' }, batch: BATCH } },
    pricing: { unit: 'image', price: 0.15, currency: 'CNY' },
  },
  {
    id: 'doubao/seedream-3.0', display_name: 'Seedream 3.0', description: '写实 / 高清出图', provider: 'doubao',
    task_types: ['gen.image'], capabilities: ['image', 'i2i'], invocation_mode: 'async', supports_streaming: false, tags: ['高清'],
    param_schema: { properties: { aspect_ratio: ASPECT, resolution: { type: 'string', enum: ['1k', '2k', '4k'], default: '2k' }, batch: BATCH } },
    pricing: { unit: 'image', price: 0.08, currency: 'CNY' },
  },
  {
    id: 'jimeng/video-v1', display_name: '即梦视频生成', description: '图生视频 / 文生视频', provider: 'jimeng',
    task_types: ['gen.video'], capabilities: ['video', 'i2v'], invocation_mode: 'async', supports_streaming: false, tags: ['推荐'],
    param_schema: { properties: { duration_sec: { type: 'integer', minimum: 1, maximum: 30, default: 5 }, aspect_ratio: { type: 'string', enum: ['16:9', '9:16', '1:1'], default: '16:9' }, batch: BATCH } },
    pricing: { unit: 'second', price: 0.5, currency: 'CNY' },
  },
  {
    id: 'doubao/seedance-2.0', display_name: 'Seedance 2.0', description: '电影级运镜视频', provider: 'doubao',
    task_types: ['gen.video'], capabilities: ['video', 'i2v'], invocation_mode: 'async', supports_streaming: false, tags: ['NEW'],
    param_schema: { properties: { duration_sec: { type: 'integer', minimum: 1, maximum: 15, default: 5 }, aspect_ratio: { type: 'string', enum: ['16:9', '9:16', '1:1'], default: '16:9' }, batch: BATCH } },
    pricing: { unit: 'second', price: 0.8, currency: 'CNY' },
  },
  {
    id: 'jimeng/tts-v1', display_name: '即梦语音合成', description: 'TTS / 音乐生成', provider: 'jimeng',
    task_types: ['gen.audio'], capabilities: ['tts', 'music'], invocation_mode: 'async', supports_streaming: false, tags: [],
    param_schema: { properties: { duration_sec: { type: 'integer', minimum: 1, maximum: 120, default: 30 }, variant: { type: 'string', enum: ['tts', 'music'], default: 'tts' } } },
    pricing: { unit: 'second', price: 0.02, currency: 'CNY' },
  },
  {
    id: 'minimax/speech-02', display_name: 'MiniMax 语音 HD', description: '高保真语音合成', provider: 'minimax',
    task_types: ['gen.audio'], capabilities: ['tts'], invocation_mode: 'async', supports_streaming: false, tags: ['HD'],
    param_schema: { properties: { duration_sec: { type: 'integer', minimum: 1, maximum: 120, default: 30 } } },
    pricing: { unit: 'character', price: 0.01, currency: 'CNY' },
  },
  {
    id: 'jimeng/asr-v1', display_name: '即梦语音转文字', description: '语音识别', provider: 'jimeng',
    task_types: ['audio.transcribe'], capabilities: ['asr'], invocation_mode: 'async', supports_streaming: false, tags: [],
    param_schema: { properties: { language: { type: 'string', enum: ['zh', 'en'], default: 'zh' } } },
    pricing: { unit: 'minute', price: 0.05, currency: 'CNY' },
  },
];

/**
 * In-process rich model registry used when DEMO_MODE=true so canvas-api can
 * serve list / schema / cost without account-api running. See M5 plan P1.
 */
@Injectable()
export class DemoModelRegistry {
  private readonly byId = new Map(MODELS.map((m) => [m.id, m]));

  list(taskType?: string): RichModelSummary[] {
    return MODELS.filter((m) => !taskType || m.task_types.includes(taskType as TaskType)).map((m) =>
      this.toSummary(m),
    );
  }

  get(id: string): RichModelSummary | null {
    const m = this.byId.get(id);
    return m ? this.toSummary(m) : null;
  }

  schema(id: string): ModelSchemaResponse | null {
    const m = this.byId.get(id);
    if (!m) return null;
    const params = paramSchemaToParamSpecs(m.param_schema);
    return { model_id: id, params, defaults: defaultsFromParamSpecs(params) };
  }

  estimateCost(id: string, params: Record<string, unknown>): CostEstimate {
    const m = this.byId.get(id);
    if (!m) return { estimated_credits: 0, currency: 'credits', breakdown: '未知模型' };
    return estimateCredits(m.pricing, params);
  }

  validateParams(id: string, params: Record<string, unknown>): ValidateParamsResult {
    const m = this.byId.get(id);
    if (!m) return { ok: false, errors: [{ field: '_', message: '未知模型' }] };
    const specs = paramSchemaToParamSpecs(m.param_schema);
    const errors: { field: string; message: string }[] = [];
    for (const s of specs) {
      const v = params[s.field];
      if (v === undefined || v === null) continue;
      if (s.options && !s.options.some((o) => String(o.value) === String(v))) {
        errors.push({ field: s.field, message: `不支持的取值: ${String(v)}` });
      }
      if (typeof v === 'number') {
        if (s.min !== undefined && v < s.min) errors.push({ field: s.field, message: `不能小于 ${s.min}` });
        if (s.max !== undefined && v > s.max) errors.push({ field: s.field, message: `不能大于 ${s.max}` });
      }
    }
    return { ok: errors.length === 0, errors };
  }

  private toSummary(m: DemoModel): RichModelSummary {
    return {
      id: m.id,
      display_name: m.display_name,
      description: m.description,
      provider: PROVIDERS[m.provider] ?? { key: m.provider, display_name: m.provider, icon_url: '' },
      task_types: m.task_types,
      capabilities: m.capabilities,
      invocation_mode: m.invocation_mode,
      supports_streaming: m.supports_streaming,
      tags: m.tags,
      deprecated: false,
      pricing_summary: pricingSummary(m.pricing),
    };
  }
}
