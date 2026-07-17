import type { UnifiedResponse } from '@xgcanvas/adapters-contract';

import type { OpenAIChatResponse } from './types';
import { normalizeOpenAIUsage } from './usage';

export function parseOpenAIChatResponse(data: OpenAIChatResponse): UnifiedResponse {
  const text = data.choices?.[0]?.message?.content ?? '';
  const usage = data.usage ? normalizeOpenAIUsage(data.usage) : undefined;
  return {
    status: 'succeeded',
    text,
    assets: [],
    usage,
  };
}
