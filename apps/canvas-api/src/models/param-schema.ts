import type { CostEstimate, ModelPricing, ParamSpec } from './model.types';

/** Fields that should NOT appear as user-visible param controls (handled by
 *  dedicated UI: prompt textarea, reference uploader, etc.). */
const SKIP_PARAM_FIELDS = new Set([
  'prompt',
  'negative_prompt',
  'mode',
  'references',
  'reference_image',
  'image',
  'first_frame',
  'last_frame',
  'driving_audio',
]);

interface SchemaPropDef {
  type?: string;
  label?: string;
  enum_options?: { value: string | number; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  default?: unknown;
  ui_width?: string;
  description?: string;
}

/** Convert a model's constraint-engine param_schema into inline-form param controls.
 *  Handles both the constraint-engine format (enum_options / min / max) and the
 *  legacy JSON-schema-ish format (enum / minimum / maximum). */
export function paramSchemaToParamSpecs(
  schema: { properties?: Record<string, unknown> } | null | undefined,
): ParamSpec[] {
  const props = schema?.properties ?? {};
  const specs: ParamSpec[] = [];
  for (const [field, raw] of Object.entries(props)) {
    if (SKIP_PARAM_FIELDS.has(field)) continue;
    const def = (raw ?? {}) as SchemaPropDef;
    const label = def.label ?? field;

    // enum — constraint-engine format uses enum_options[], legacy uses enum[]
    const enumOpts = def.enum_options ?? (def as any).enum?.map((v: string | number) => ({ value: v, label: String(v) }));
    if (enumOpts?.length) {
      specs.push({
        field,
        label,
        control: 'chips',
        options: enumOpts,
        default: def.default ?? enumOpts[0].value,
      });
      continue;
    }

    // numeric — constraint-engine uses min/max, legacy uses minimum/maximum
    if (def.type === 'integer' || def.type === 'number' || def.type === 'slider') {
      const min = def.min ?? (def as any).minimum;
      const max = def.max ?? (def as any).maximum;
      const hasRange = typeof min === 'number' && typeof max === 'number';
      const span = hasRange ? (max as number) - (min as number) : Infinity;
      const isSlider = def.type === 'slider' || (hasRange && span <= 32);
      specs.push({
        field,
        label,
        control: isSlider ? 'slider' : 'number',
        min,
        max,
        step: def.step ?? (def.type === 'integer' ? 1 : 0.1),
        default: def.default,
      });
      continue;
    }

    // boolean
    if (def.type === 'boolean') {
      specs.push({ field, label, control: 'toggle', default: def.default ?? false });
      continue;
    }
  }
  return specs;
}

export function defaultsFromParamSpecs(specs: ParamSpec[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of specs) if (s.default !== undefined) out[s.field] = s.default;
  return out;
}

/**
 * Estimate compute-credits for display next to the generate button.
 * Demo-grade heuristic (the real path uses account-api estimate-cost).
 */
export function estimateCredits(
  pricing: ModelPricing | null | undefined,
  params: Record<string, unknown>,
): CostEstimate {
  const n = Math.max(1, Number(params.batch) || 1);
  if (!pricing?.unit) return { estimated_credits: 0, currency: 'credits', breakdown: '暂无定价' };
  switch (pricing.unit) {
    case 'token': {
      const out = Number(params.max_tokens) || 1024;
      return { estimated_credits: Math.max(1, Math.ceil(out / 256)), currency: 'credits', breakdown: `约 ${out} tokens` };
    }
    case 'image':
      return { estimated_credits: 12 * n, currency: 'credits', breakdown: n > 1 ? `${n} 张图片` : '单张图片' };
    case 'second': {
      const d = Number(params.duration_sec) || 5;
      return { estimated_credits: Math.ceil(d * 8) * n, currency: 'credits', breakdown: `${d}s 视频${n > 1 ? ` ×${n}` : ''}` };
    }
    case 'character':
    case 'minute': {
      const d = Number(params.duration_sec) || 10;
      return { estimated_credits: Math.max(1, Math.ceil(d / 2)), currency: 'credits', breakdown: `${d}s 音频` };
    }
    default:
      return { estimated_credits: 0, currency: 'credits', breakdown: '暂无定价' };
  }
}

export function pricingSummary(pricing: ModelPricing | null | undefined): string {
  if (!pricing?.unit) return '';
  const sym = pricing.currency === 'USD' ? '$' : '¥';
  switch (pricing.unit) {
    case 'token':
      return `${sym}${pricing.input_price ?? '?'}/1K tokens`;
    case 'image':
      return `${sym}${pricing.price ?? '?'}/张`;
    case 'second':
      return `${sym}${pricing.price ?? '?'}/秒`;
    case 'character':
      return `${sym}${pricing.price ?? '?'}/千字`;
    case 'minute':
      return `${sym}${pricing.price ?? '?'}/分钟`;
    default:
      return '';
  }
}
