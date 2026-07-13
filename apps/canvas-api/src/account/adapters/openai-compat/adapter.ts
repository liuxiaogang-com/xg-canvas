import {
  AdapterError,
  type InvokeCtx,
  type ProviderAdapter,
  type StreamChunk,
  type UnifiedRequest,
  type UnifiedResponse,
} from '@xgcanvas/adapters-contract';
import { ERROR_CODES, type TaskType } from '@xgcanvas/shared-types';

import { httpJson } from '../_shared/http-client';
import { mapVendorError } from '../_shared/error-mapper';
import { buildOpenAIChatRequest } from './request-builder';
import { parseOpenAIChatResponse } from './response-parser';
import type { OpenAIChatResponse, OpenAIChatStreamChunk, OpenAIUsage } from './types';

const DEFAULT_BASE = 'https://api.openai.com/v1';

const CAPS: readonly TaskType[] = ['gen.text'];

export class OpenAICompatAdapter implements ProviderAdapter {
  readonly key = 'openai-compat';
  readonly capabilities = CAPS;
  readonly invocationMode = 'sync' as const;

  async invoke(req: UnifiedRequest, ctx: InvokeCtx): Promise<UnifiedResponse> {
    const apiKey = readApiKey(ctx);
    const base = (ctx.channel.base_url || DEFAULT_BASE).replace(/\/$/, '');
    try {
      const body = buildOpenAIChatRequest(req);
      const res = await httpJson<OpenAIChatResponse>({
        url: `${base}/chat/completions`,
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}` },
        body,
        signal: ctx.signal,
      });
      return parseOpenAIChatResponse(res.data);
    } catch (e) {
      throw mapVendorError(e);
    }
  }

  async *stream(req: UnifiedRequest, ctx: InvokeCtx): AsyncIterable<StreamChunk> {
    const apiKey = readApiKey(ctx);
    const base = (ctx.channel.base_url || DEFAULT_BASE).replace(/\/$/, '');
    const body = buildOpenAIChatRequest({ ...req, stream: true });

    let res: Response;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: ctx.signal,
      });
    } catch (e) {
      throw mapVendorError(e);
    }
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      throw new AdapterError({
        code:
          res.status === 401 || res.status === 403
            ? ERROR_CODES.CREDENTIAL_INVALID
            : res.status === 429
              ? ERROR_CODES.RATE_LIMITED
              : ERROR_CODES.VENDOR_UNAVAILABLE,
        message: `openai-compat stream HTTP ${res.status}: ${detail.slice(0, 300)}`,
        retryable: res.status === 429 || res.status >= 500,
        httpStatus: res.status,
      });
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let fullText = '';
    let usage: OpenAIUsage | undefined;

    // try/finally so the vendor stream is released on ANY exit — normal end, parse
    // error, or the consumer abandoning the generator (client disconnect -> ctx.signal
    // abort). Without reader.cancel() the underlying fetch keeps draining the vendor.
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line || line.startsWith(':')) continue; // blank / keep-alive
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          let json: OpenAIChatStreamChunk;
          try {
            json = JSON.parse(data) as OpenAIChatStreamChunk;
          } catch {
            continue; // partial frame split across reads is rare here, but be safe
          }
          const delta = json.choices?.[0]?.delta;
          if (delta?.content) {
            fullText += delta.content;
            yield { text_delta: delta.content };
          }
          if (delta?.reasoning_content) yield { reasoning_delta: delta.reasoning_content };
          if (json.usage) usage = json.usage;
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }

    yield {
      done: {
        status: 'succeeded',
        text: fullText,
        assets: [],
        usage: usage
          ? { input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens }
          : undefined,
      },
    };
  }
}

function readApiKey(ctx: InvokeCtx): string {
  const key = (ctx.credential.payload as Record<string, unknown>).api_key;
  if (typeof key !== 'string' || !key) {
    throw new AdapterError({
      code: ERROR_CODES.CREDENTIAL_INVALID,
      message: 'openai-compat credential missing api_key',
    });
  }
  return key;
}
