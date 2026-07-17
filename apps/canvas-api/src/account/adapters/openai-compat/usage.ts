import type { UsageStats } from '@xgcanvas/adapters-contract';
import type { OpenAIUsage } from './types';

/** Split cached prompt tokens so a Rate Card never charges them twice. */
export function normalizeOpenAIUsage(usage: OpenAIUsage): UsageStats {
  const cached = nonNegative(
    usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens ?? 0,
  );
  const prompt = nonNegative(usage.prompt_tokens);
  return {
    input_tokens: Math.max(prompt - cached, 0),
    ...(cached > 0 ? { cached_input_tokens: cached } : {}),
    output_tokens: nonNegative(usage.completion_tokens),
  };
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}
