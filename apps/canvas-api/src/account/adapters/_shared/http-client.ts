import { AdapterError } from '@xgcanvas/adapters-contract';
import { ERROR_CODES, type ErrorCode } from '@xgcanvas/shared-types';
import { readBoundedText, ResponseBodyTooLargeError } from '../../../common/http/bounded-body';
import { guardedFetch } from '../../../common/http/guarded-outbound';

export interface HttpRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Write requests default to never; opt in only for genuinely idempotent operations. */
  retry?: 'safe' | 'never';
}

export interface HttpResponseLike<T = unknown> {
  status: number;
  headers: Headers;
  data: T;
}

const DEFAULT_TIMEOUT = 60_000;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 2;
const MAX_SUCCESS_BODY_BYTES = 8 * 1024 * 1024;
const MAX_ERROR_BODY_BYTES = 64 * 1024;

export async function httpJson<T = unknown>(req: HttpRequest): Promise<HttpResponseLike<T>> {
  const method = req.method ?? 'POST';
  const safeToRetry = req.retry === 'safe' || (req.retry === undefined && method === 'GET');
  const maxRetries = safeToRetry ? MAX_RETRIES : 0;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await once<T>(req, safeToRetry);
    } catch (e) {
      lastErr = e;
      const retryable = e instanceof AdapterError && e.retryable;
      if (!retryable || attempt === maxRetries) throw e;
      await sleep(200 * (attempt + 1) ** 2);
    }
  }
  throw lastErr;
}

async function once<T>(req: HttpRequest, safeToRetry: boolean): Promise<HttpResponseLike<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? DEFAULT_TIMEOUT);
  const composedSignal = req.signal ? anySignal(req.signal, controller.signal) : controller.signal;
  try {
    const res = await guardedFetch(req.url, {
      method: req.method ?? 'POST',
      headers: { 'content-type': 'application/json', ...(req.headers ?? {}) },
      body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      signal: composedSignal,
    });
    let text: string;
    try {
      text = await readBoundedText(res, res.ok ? MAX_SUCCESS_BODY_BYTES : MAX_ERROR_BODY_BYTES);
    } catch (error) {
      if (!(error instanceof ResponseBodyTooLargeError)) throw error;
      if (!res.ok) {
        throw mapStatus(
          res.status,
          { message: `vendor error response exceeded ${error.maxBytes} bytes` },
          safeToRetry,
        );
      }
      throw new AdapterError({
        code: ERROR_CODES.VENDOR_REJECTED,
        message: `vendor response exceeded ${error.maxBytes} bytes`,
        retryable: false,
        httpStatus: res.status,
        dispatch_outcome: safeToRetry ? 'definitely_rejected' : 'outcome_unknown',
      });
    }
    let data: T;
    try {
      data = (text ? JSON.parse(text) : {}) as T;
    } catch {
      data = text as unknown as T;
    }
    if (!res.ok) throw mapStatus(res.status, data, safeToRetry);
    return { status: res.status, headers: res.headers, data };
  } catch (e) {
    if (e instanceof AdapterError) throw e;
    if ((e as Error).name === 'AbortError') {
      throw new AdapterError({
        code: ERROR_CODES.VENDOR_TIMEOUT,
        message: `request timed out: ${req.url}`,
        retryable: true,
        dispatch_outcome: safeToRetry ? 'definitely_rejected' : 'outcome_unknown',
      });
    }
    const cause = (e as { cause?: { message?: string; code?: string; errors?: unknown[] } }).cause;
    const detail =
      cause?.code || cause?.message ? ` (${cause?.code ?? ''} ${cause?.message ?? ''})`.trim() : '';
    throw new AdapterError({
      code: ERROR_CODES.VENDOR_UNAVAILABLE,
      message: `${(e as Error).message}${detail ? ': ' + detail : ''}`,
      retryable: true,
      dispatch_outcome: safeToRetry ? 'definitely_rejected' : 'outcome_unknown',
      vendor: cause ?? e,
    });
  } finally {
    clearTimeout(timer);
  }
}

function mapStatus(status: number, body: unknown, safeToRetry: boolean): AdapterError {
  let code: ErrorCode = ERROR_CODES.VENDOR_REJECTED;
  if (status === 401 || status === 403) code = ERROR_CODES.CREDENTIAL_INVALID;
  else if (status === 429) code = ERROR_CODES.RATE_LIMITED;
  else if (status >= 500) code = ERROR_CODES.VENDOR_UNAVAILABLE;
  return new AdapterError({
    code,
    message: extractMessage(body) ?? `vendor responded ${status}`,
    retryable: RETRYABLE_STATUS.has(status),
    vendor: body,
    httpStatus: status,
    dispatch_outcome:
      safeToRetry || status < 500 || status === 429 ? 'definitely_rejected' : 'outcome_unknown',
  });
}

function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, any>;
  return b.error?.message ?? b.message ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function anySignal(...signals: AbortSignal[]): AbortSignal {
  const ctrl = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      ctrl.abort();
      break;
    }
    s.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  return ctrl.signal;
}
