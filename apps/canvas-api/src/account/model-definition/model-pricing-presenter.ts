import {
  normalizeCatalogPricing,
  parseCatalogPricing,
  type CatalogPricingMeter,
} from '@xgcanvas/model-catalog';

export interface ModelCostEstimate {
  estimated_cost: number | null;
  currency: string | null;
  breakdown: string;
}

export function estimateModelPricing(
  raw: unknown,
  params: Record<string, unknown>,
  inputTextLength?: number,
): ModelCostEstimate {
  const pricing = parseOrNull(raw);
  if (!pricing) return unavailable();
  const normalized = normalizeCatalogPricing(
    pricing,
    typeof params.quality === 'string' ? params.quality : undefined,
  );
  let cost = 0;
  let matched = 0;
  for (const component of normalized.components) {
    const quantity = estimatedQuantity(component.meter, params, inputTextLength);
    if (quantity === null) continue;
    cost += (quantity / component.per) * component.price;
    matched += 1;
  }
  if (matched === 0) {
    return {
      estimated_cost: null,
      currency: normalized.currency,
      breakdown: '当前参数不足以估算，最终以实际用量为准',
    };
  }
  return {
    estimated_cost: Math.ceil(cost * 10000) / 10000,
    currency: normalized.currency,
    breakdown: '根据当前参数估算，最终以实际用量为准',
  };
}

export function formatModelPricingSummary(raw: unknown): string {
  const pricing = parseOrNull(raw);
  if (!pricing) return '';
  const normalized = normalizeCatalogPricing(pricing);
  const symbol = normalized.currency === 'CNY' ? '¥' : `${normalized.currency} `;
  const parts = normalized.components
    .slice(0, 2)
    .map(
      (component) => `${symbol}${component.price}/${formatUnit(component.meter, component.per)}`,
    );
  if (normalized.components.length > 2) parts.push('等');
  return parts.join(' · ');
}

function parseOrNull(value: unknown) {
  try {
    return parseCatalogPricing(value);
  } catch {
    return null;
  }
}

function estimatedQuantity(
  meter: CatalogPricingMeter,
  params: Record<string, unknown>,
  inputTextLength?: number,
): number | null {
  switch (meter) {
    case 'requests':
      return 1;
    case 'image_count':
      return numeric(params.image_count ?? params.n, 1);
    case 'duration_seconds':
      return numeric(params.duration_seconds ?? params.duration, null);
    case 'input_tokens':
      return numeric(params.input_tokens, inputTextLength ? Math.ceil(inputTextLength / 3) : 1000);
    case 'output_tokens':
      return numeric(params.output_tokens ?? params.max_tokens, 1000);
    case 'cached_input_tokens':
      return numeric(params.cached_input_tokens, null);
  }
}

function numeric(value: unknown, fallback: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function formatUnit(meter: CatalogPricingMeter, per: number): string {
  const quantity = per === 1000 ? '1K ' : per === 1 ? '' : `${per} `;
  const label: Record<CatalogPricingMeter, string> = {
    input_tokens: '输入 tokens',
    output_tokens: '输出 tokens',
    cached_input_tokens: '缓存 tokens',
    duration_seconds: '秒',
    image_count: '张',
    requests: '次',
  };
  return `${quantity}${label[meter]}`;
}

function unavailable(): ModelCostEstimate {
  return { estimated_cost: null, currency: null, breakdown: '该模型暂无定价信息' };
}
