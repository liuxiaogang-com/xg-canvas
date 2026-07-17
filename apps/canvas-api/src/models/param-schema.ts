import type { ParamSpec } from './model.types';

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

/** Convert the canonical Catalog Param Schema into inline-form controls. */
export function paramSchemaToParamSpecs(
  schema: { properties?: Record<string, unknown> } | null | undefined,
): ParamSpec[] {
  const props = schema?.properties ?? {};
  const specs: ParamSpec[] = [];
  for (const [field, raw] of Object.entries(props)) {
    if (SKIP_PARAM_FIELDS.has(field)) continue;
    const def = (raw ?? {}) as SchemaPropDef;
    const label = def.label ?? field;

    const enumOpts = def.enum_options;
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

    if (def.type === 'integer' || def.type === 'number' || def.type === 'slider') {
      const min = def.min;
      const max = def.max;
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
