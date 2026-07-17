import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { Readable } from 'node:stream';

const DEFAULT_MAX_REDIRECTS = 3;
const SENSITIVE_REDIRECT_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization']);

interface LookupAddress {
  address: string;
  family: number;
}

export interface GuardedFetchOptions {
  redirect?: 'error' | 'follow';
  maxRedirects?: number;
  /** Test seam; production callers must leave this undefined. */
  lookup?: (hostname: string) => Promise<LookupAddress[]>;
  /** Test seam; production callers must leave this undefined. */
  requestOnce?: typeof requestPinned;
}

export interface PublicTarget {
  address: string;
  family: 4 | 6;
}

export class UnsafeOutboundAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeOutboundAddressError';
  }
}

/** HTTPS-only fetch with all DNS answers validated and the socket pinned to one answer. */
export async function guardedFetch(
  input: string | URL,
  init: RequestInit = {},
  options: GuardedFetchOptions = {},
): Promise<Response> {
  const redirectMode = options.redirect ?? 'error';
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const lookup = options.lookup ?? lookupAll;
  const requestOnce = options.requestOnce ?? requestPinned;
  let current = parsePublicHttpsUrl(input);
  let method = (init.method ?? 'GET').toUpperCase();
  let body = init.body;
  let headers = new Headers(init.headers);

  for (let redirects = 0; ; redirects += 1) {
    const target = await resolvePublicTarget(current.hostname, lookup);
    const response = await requestOnce(current, { ...init, method, body, headers }, target);
    if (response.status < 300 || response.status >= 400) return response;

    await response.body?.cancel().catch(() => undefined);
    if (redirectMode === 'error') {
      throw new UnsafeOutboundAddressError(`outbound redirect is not allowed: ${response.status}`);
    }
    if (redirects >= maxRedirects) {
      throw new UnsafeOutboundAddressError(`outbound redirect limit exceeded: ${maxRedirects}`);
    }
    if (method !== 'GET' && method !== 'HEAD') {
      throw new UnsafeOutboundAddressError('only GET/HEAD asset requests may follow redirects');
    }
    const location = response.headers.get('location');
    if (!location) throw new UnsafeOutboundAddressError('outbound redirect has no location');
    const next = parsePublicHttpsUrl(new URL(location, current));
    if (next.origin !== current.origin) headers = withoutSensitiveHeaders(headers);
    current = next;
    body = undefined;
  }
}

export async function resolvePublicTarget(
  hostname: string,
  lookup: (hostname: string) => Promise<LookupAddress[]> = lookupAll,
): Promise<PublicTarget> {
  const normalized = stripIpv6Brackets(hostname).toLowerCase();
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
    throw new UnsafeOutboundAddressError(`outbound hostname is not public: ${hostname}`);
  }
  const literalFamily = isIP(normalized);
  const answers = literalFamily
    ? [{ address: normalized, family: literalFamily as 4 | 6 }]
    : await lookup(normalized);
  if (answers.length === 0) {
    throw new UnsafeOutboundAddressError(`outbound hostname has no address: ${hostname}`);
  }
  for (const answer of answers) {
    if (!isPublicIpAddress(answer.address)) {
      throw new UnsafeOutboundAddressError(
        `outbound hostname resolved to a non-public address: ${hostname}`,
      );
    }
  }
  const selected = answers[0];
  return { address: selected.address, family: selected.family as 4 | 6 };
}

export function isPublicIpAddress(address: string): boolean {
  const normalized = stripIpv6Brackets(address).toLowerCase();
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIpv4(mapped[1]);
  const family = isIP(normalized);
  if (family === 4) return isPublicIpv4(normalized);
  if (family !== 6) return false;
  if (normalized === '::' || normalized === '::1') return false;
  const first = Number.parseInt(normalized.split(':')[0] || '0', 16);
  if (first < 0x2000 || first > 0x3fff) return false;
  if (normalized.startsWith('2001:db8:') || normalized === '2001:db8::') return false;
  return true;
}

async function lookupAll(hostname: string): Promise<LookupAddress[]> {
  return dnsLookup(hostname, { all: true, verbatim: true }) as Promise<LookupAddress[]>;
}

function parsePublicHttpsUrl(input: string | URL): URL {
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input) : new URL(input);
  } catch {
    throw new UnsafeOutboundAddressError('outbound URL must be absolute');
  }
  if (url.protocol !== 'https:') {
    throw new UnsafeOutboundAddressError('outbound URL must use HTTPS');
  }
  if (!url.hostname || url.username || url.password) {
    throw new UnsafeOutboundAddressError('outbound URL has an invalid authority');
  }
  return url;
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    return false;
  }
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return a < 224;
}

function withoutSensitiveHeaders(input: Headers): Headers {
  const headers = new Headers(input);
  for (const name of SENSITIVE_REDIRECT_HEADERS) headers.delete(name);
  return headers;
}

function stripIpv6Brackets(value: string): string {
  return value.replace(/^\[|\]$/g, '');
}

async function requestPinned(url: URL, init: RequestInit, target: PublicTarget): Promise<Response> {
  const headers = new Headers(init.headers);
  const options: RequestOptions & { autoSelectFamily?: boolean } = {
    method: init.method ?? 'GET',
    headers: Object.fromEntries(headers.entries()),
    signal: init.signal ?? undefined,
    servername: stripIpv6Brackets(url.hostname),
    family: target.family,
    autoSelectFamily: false,
    lookup: ((_hostname, _options, callback) => {
      callback(null, target.address, target.family);
    }) satisfies LookupFunction,
  };
  return new Promise<Response>((resolve, reject) => {
    const request = httpsRequest(url, options, (incoming) => {
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) value.forEach((item) => responseHeaders.append(name, item));
        else if (value !== undefined) responseHeaders.set(name, value);
      }
      const hasBody =
        init.method !== 'HEAD' &&
        incoming.statusCode !== 204 &&
        incoming.statusCode !== 205 &&
        incoming.statusCode !== 304;
      const response = new Response(
        hasBody ? (Readable.toWeb(incoming) as ReadableStream<Uint8Array>) : null,
        {
          status: incoming.statusCode ?? 500,
          statusText: incoming.statusMessage,
          headers: responseHeaders,
        },
      );
      Object.defineProperty(response, 'url', { value: url.toString() });
      resolve(response);
    });
    request.once('error', reject);
    writeRequestBody(request, init.body);
  });
}

function writeRequestBody(
  request: ReturnType<typeof httpsRequest>,
  body: BodyInit | null | undefined,
): void {
  if (body == null) {
    request.end();
    return;
  }
  if (typeof body === 'string' || body instanceof Uint8Array) {
    request.end(body);
    return;
  }
  if (body instanceof ArrayBuffer) {
    request.end(new Uint8Array(body));
    return;
  }
  if (body instanceof URLSearchParams) {
    request.end(body.toString());
    return;
  }
  request.destroy(new TypeError('unsupported guarded outbound request body'));
}
