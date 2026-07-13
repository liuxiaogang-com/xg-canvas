/**
 * Thin fetch wrapper. canvas-api always answers in {ok, data} envelope on
 * success or {ok:false, error:{code,message}} on failure (see
 * common/interceptors/response-envelope.interceptor on the server).
 *
 * Opaque sessions: on a 401 we try one silent /auth/refresh (single-flight) and
 * replay the request once; if that fails the session is gone and we hand off to
 * the auth-expired handler (registered by the auth store) to bounce to /auth.
 */

const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

export interface ApiInit extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

let refreshing: Promise<boolean> | null = null;
let onAuthExpired: (() => void) | null = null;

/** Registered by the auth store so client.ts stays free of a store import. */
export function setAuthExpiredHandler(fn: () => void): void {
  onAuthExpired = fn;
}

async function doRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}

/** Single-flight: concurrent 401s share one /auth/refresh, not a thundering herd. */
export function ensureRefresh(): Promise<boolean> {
  if (!refreshing) refreshing = doRefresh().finally(() => (refreshing = null));
  return refreshing;
}

function rawFetch(path: string, init: ApiInit): Promise<Response> {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const headers = new Headers(init.headers);
  const isJsonBody = init.body !== undefined && !(init.body instanceof FormData);
  if (isJsonBody) headers.set('content-type', 'application/json');
  const fetchBody: BodyInit | undefined =
    init.body === undefined
      ? undefined
      : init.body instanceof FormData
        ? init.body
        : JSON.stringify(init.body);
  return fetch(url, { ...init, credentials: 'include', headers, body: fetchBody });
}

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  let res = await rawFetch(path, init);
  // Only an expired/missing session may trigger renewal. Business-level 401s
  // such as INVALID_CODE must reach the caller without replaying a mutation or
  // clearing an otherwise valid login.
  const initialErrorCode = res.status === 401 ? await responseErrorCode(res) : null;
  if (res.status === 401 && initialErrorCode === 'UNAUTHORIZED' && !path.startsWith('/auth/')) {
    const ok = await ensureRefresh();
    if (ok) res = await rawFetch(path, init);
    const replayErrorCode = res.status === 401 ? await responseErrorCode(res) : null;
    if (res.status === 401 && replayErrorCode === 'UNAUTHORIZED') onAuthExpired?.();
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? safeParse(text) : null;
  if (!res.ok) {
    const e = (json as { error?: { code?: string; message?: string; request_id?: string } })?.error;
    const reqId = e?.request_id ?? res.headers.get('x-request-id') ?? undefined;
    const base = e?.message ?? `HTTP ${res.status}`;
    // Surface the request id in the message so any toast.error(e.message) shows it. (F3)
    const msg = reqId ? `${base}（请求 ID: ${reqId}）` : base;
    throw new ApiError(e?.code ?? 'INTERNAL_ERROR', msg, res.status, reqId);
  }
  return ((json as { data?: T }) ?? { data: undefined as T }).data as T;
}

async function responseErrorCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.clone().json()) as { error?: { code?: string } };
    return body?.error?.code ?? null;
  } catch {
    return null;
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
