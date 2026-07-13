import { buildOpenAIChatRequest } from '../request-builder';

describe('buildOpenAIChatRequest', () => {
  const baseReq = {
    task_type: 'gen.text' as const,
    model_id: 'openai:gpt-4o',
    provider_model: 'gpt-4o',
    params: {},
    inputs: {},
  };

  it('builds messages from system_prompt + prompt when messages absent', () => {
    const out = buildOpenAIChatRequest({
      ...baseReq,
      inputs: { system_prompt: 'sys', prompt: 'hi' },
    });
    expect(out.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ]);
    expect(out.model).toBe('gpt-4o');
  });

  it('passes through messages when provided', () => {
    const out = buildOpenAIChatRequest({
      ...baseReq,
      inputs: { messages: [{ role: 'user', content: 'q' }] },
    });
    expect(out.messages).toEqual([{ role: 'user', content: 'q' }]);
  });

  it('forwards generation params and json_mode', () => {
    const out = buildOpenAIChatRequest({
      ...baseReq,
      params: { temperature: 0.5, max_tokens: 512, json_mode: true },
    });
    expect(out.temperature).toBe(0.5);
    expect(out.max_tokens).toBe(512);
    expect(out.response_format).toEqual({ type: 'json_object' });
  });
});
