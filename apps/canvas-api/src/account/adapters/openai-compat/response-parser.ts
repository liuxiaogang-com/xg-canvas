import type { UnifiedResponse } from '@xgcanvas/adapters-contract';

import type { OpenAIChatResponse } from './types';

export function parseOpenAIChatResponse(data: OpenAIChatResponse): UnifiedResponse {
  const text = data.choices?.[0]?.message?.content ?? '';
  const usage = data.usage
    ? {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens,
      }
    : undefined;
  return {
    status: 'succeeded',
    text,
    assets: [],
    usage,
  };
}
