export interface OpenAIChatRequest {
  model: string;
  messages: Array<{ role: string; content: unknown }>;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  /** Ask the vendor to include a final usage chunk while streaming (DeepSeek/OpenAI). */
  stream_options?: { include_usage: boolean };
  response_format?: { type: 'text' | 'json_object' };
  /** Reasoning effort (OpenAI o-series / DeepSeek V4): 'high' | 'max'. */
  reasoning_effort?: 'high' | 'max';
  /** DeepSeek V4 thinking toggle — V4 models think by default; disable for fast/cheap chat. */
  thinking?: { type: 'enabled' | 'disabled' };
}

/** Token usage as returned by OpenAI-compatible vendors (superset; DeepSeek extras included). */
export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  /** DeepSeek context-cache split (prompt_tokens = hit + miss). */
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}

export interface OpenAIChatMessage {
  role: string;
  content: string | null;
  /** DeepSeek reasoning models emit chain-of-thought here, separate from content. */
  reasoning_content?: string | null;
}

export interface OpenAIChatResponse {
  id: string;
  choices: Array<{
    index: number;
    message: OpenAIChatMessage;
    finish_reason: string;
  }>;
  usage?: OpenAIUsage;
}

/** One SSE chunk in a streaming chat completion. */
export interface OpenAIChatStreamChunk {
  id: string;
  choices: Array<{
    index: number;
    delta: { role?: string; content?: string | null; reasoning_content?: string | null };
    finish_reason: string | null;
  }>;
  /** Populated on the final usage chunk (when stream_options.include_usage=true). */
  usage?: OpenAIUsage | null;
}
