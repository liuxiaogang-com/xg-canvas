import { normalizeOpenAIUsage } from './usage';

describe('normalizeOpenAIUsage', () => {
  it('splits OpenAI cached tokens from billable uncached input', () => {
    expect(
      normalizeOpenAIUsage({
        prompt_tokens: 1_000,
        completion_tokens: 200,
        total_tokens: 1_200,
        prompt_tokens_details: { cached_tokens: 400 },
      }),
    ).toEqual({
      input_tokens: 600,
      cached_input_tokens: 400,
      output_tokens: 200,
    });
  });

  it('supports the DeepSeek cache-hit field and clamps malformed totals', () => {
    expect(
      normalizeOpenAIUsage({
        prompt_tokens: 100,
        completion_tokens: 5,
        total_tokens: 105,
        prompt_cache_hit_tokens: 120,
      }),
    ).toEqual({
      input_tokens: 0,
      cached_input_tokens: 120,
      output_tokens: 5,
    });
  });
});
