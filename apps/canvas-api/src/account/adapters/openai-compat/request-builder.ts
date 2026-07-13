import type { UnifiedRequest } from '@xgcanvas/adapters-contract';

import type { OpenAIChatRequest } from './types';

/**
 * UnifiedRequest -> OpenAI chat-completions body.
 * Pure function for testability. Does not touch credentials or URLs.
 */
export function buildOpenAIChatRequest(req: UnifiedRequest): OpenAIChatRequest {
  const messages = req.inputs.messages
    ? req.inputs.messages.map((m) => ({ role: m.role, content: m.content }))
    : buildMessagesFromPrompt(req);
  const params = req.params as Record<string, unknown>;
  const out: OpenAIChatRequest = {
    model: req.provider_model,
    messages,
  };
  if (typeof params.temperature === 'number') out.temperature = params.temperature;
  if (typeof params.top_p === 'number') out.top_p = params.top_p;
  if (typeof params.max_tokens === 'number') out.max_tokens = params.max_tokens;
  if (params.json_mode === true) out.response_format = { type: 'json_object' };

  // DeepSeek V4 thinking toggle (V4 models think by default — disable for fast/cheap chat).
  if (params.thinking === true || params.thinking === 'enabled') out.thinking = { type: 'enabled' };
  else if (params.thinking === false || params.thinking === 'disabled') out.thinking = { type: 'disabled' };
  if (params.reasoning_effort === 'high' || params.reasoning_effort === 'max') {
    out.reasoning_effort = params.reasoning_effort;
  }

  if (req.stream) {
    out.stream = true;
    // Required to get a token-usage chunk while streaming (for billing).
    out.stream_options = { include_usage: true };
  }
  return out;
}

function buildMessagesFromPrompt(req: UnifiedRequest): OpenAIChatRequest['messages'] {
  const msgs: OpenAIChatRequest['messages'] = [];
  if (req.inputs.system_prompt) {
    msgs.push({ role: 'system', content: req.inputs.system_prompt });
  }
  if (req.inputs.prompt) {
    msgs.push({ role: 'user', content: req.inputs.prompt });
  }
  return msgs;
}
