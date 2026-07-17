import {
  AdapterError,
  type InvokeCtx,
  type ProviderAdapter,
  type StreamChunk,
  type UnifiedRequest,
  type UnifiedResponse,
} from '@xgcanvas/adapters-contract';
import { BUILTIN_ADAPTER_CAPABILITIES, ERROR_CODES } from '@xgcanvas/shared-types';
import { readBoundedText } from '../../../common/http/bounded-body';
import { guardedFetch } from '../../../common/http/guarded-outbound';

import { httpJson } from '../_shared/http-client';
import { mapVendorError } from '../_shared/error-mapper';
import { buildOpenAIChatRequest } from './request-builder';
import { parseOpenAIChatResponse } from './response-parser';
import type { OpenAIChatResponse, OpenAIChatStreamChunk, OpenAIUsage } from './types';
import { normalizeOpenAIUsage } from './usage';

const DEFAULT_BASE = 'https://api.openai.com/v1';

const CAPS = BUILTIN_ADAPTER_CAPABILITIES['openai-compat'];
const MAX_STREAM_ERROR_BYTES = 64 * 1024;
const MAX_STREAM_BYTES = 16 * 1024 * 1024;
const MAX_STREAM_BUFFER_CHARS = 1024 * 1024;
const MAX_STREAM_TEXT_CHARS = 8 * 1024 * 1024;

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
      res = await guardedFetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: ctx.signal,
      });
    } catch (e) {
      throw mapVendorError(e);
    }
    if (!res.ok || !res.body) {
      const detail = await readBoundedText(res, MAX_STREAM_ERROR_BYTES).catch(
        () => 'response body exceeded the error limit',
      );
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
    let totalBytes = 0;
    let usage: OpenAIUsage | undefined;

    // try/finally so the vendor stream is released on ANY exit — normal end, parse
    // error, or the consumer abandoning the generator (client disconnect -> ctx.signal
    // abort). Without reader.cancel() the underlying fetch keeps draining the vendor.
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_STREAM_BYTES) {
          throw streamTooLarge(`stream exceeded ${MAX_STREAM_BYTES} bytes`);
        }
        buf += decoder.decode(value, { stream: true });
        if (buf.length > MAX_STREAM_BUFFER_CHARS && !buf.includes('\n')) {
          throw streamTooLarge(`stream frame exceeded ${MAX_STREAM_BUFFER_CHARS} characters`);
        }
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
            if (fullText.length > MAX_STREAM_TEXT_CHARS) {
              throw streamTooLarge(`stream text exceeded ${MAX_STREAM_TEXT_CHARS} characters`);
            }
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
        usage: usage ? normalizeOpenAIUsage(usage) : undefined,
      },
    };
  }
}

function streamTooLarge(message: string): AdapterError {
  return new AdapterError({
    code: ERROR_CODES.VENDOR_REJECTED,
    message,
    retryable: false,
    dispatch_outcome: 'outcome_unknown',
  });
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
