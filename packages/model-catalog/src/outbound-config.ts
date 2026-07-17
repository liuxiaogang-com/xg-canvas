import type { ChannelRouteSnapshot } from '@xgcanvas/shared-types';

export const REDACTED_SECRET = '[REDACTED]';

export interface OutboundConfigIssue {
  path: Array<string | number>;
  message: string;
}

const SECRET_KEY_NAMES = new Set([
  'api_key',
  'apikey',
  'x_api_key',
  'x_goog_api_key',
  'subscription_key',
  'access_key',
  'access_key_id',
  'aws_access_key_id',
  'secret_key',
  'secret_access_key',
  'aws_secret_access_key',
  'private_key',
  'client_secret',
  'authorization',
  'proxy_authorization',
  'auth',
  'authentication',
  'credentials',
  'token',
  'refresh_token',
  'password',
  'passwd',
  'pwd',
  'secret',
  'cookie',
  'set_cookie',
]);

const SENSITIVE_QUERY_NAMES = new Set(['key', 'sig', 'signature', 'credential', 'code']);
const URL_IN_TEXT = /\bhttps?:\/\/[^\s"'<>]+/gi;
const AUTH_SCHEME_IN_TEXT = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const SENSITIVE_HEADER_IN_TEXT =
  /\b(authorization|proxy-authorization|cookie|set-cookie)\s*:\s*[^\r\n]+/gi;
const SECRET_ASSIGNMENT_IN_TEXT =
  /(\b(?:api[-_ ]?key|x[-_ ]?goog[-_ ]?api[-_ ]?key|subscription[-_ ]?key|access[-_ ]?key(?:[-_ ]?id)?|secret[-_ ]?access[-_ ]?key|client[-_ ]?secret|refresh[-_ ]?token|token|password|passwd|pwd|secret|signature|credential)\b\s*[:=]\s*)([^&\s,;]+)/gi;

/** Normalize snake/kebab/camel/header spelling before classifying a config key. */
export function normalizeOutboundConfigKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function isSecretLikeConfigKey(key: string): boolean {
  const normalized = normalizeOutboundConfigKey(key);
  return (
    SECRET_KEY_NAMES.has(normalized) ||
    normalized.endsWith('_token') ||
    normalized.endsWith('_password') ||
    normalized.endsWith('_secret') ||
    normalized.endsWith('_cookie')
  );
}

export function isSensitiveUrlQueryKey(key: string): boolean {
  const normalized = normalizeOutboundConfigKey(key);
  return (
    isSecretLikeConfigKey(key) ||
    SENSITIVE_QUERY_NAMES.has(normalized) ||
    normalized.endsWith('_key') ||
    normalized.endsWith('_sig') ||
    normalized.endsWith('_signature') ||
    normalized.endsWith('_credential') ||
    normalized.endsWith('_access_id') ||
    normalized === 'accessid'
  );
}

/**
 * Validate a vendor endpoint. Catalog endpoints are credential-bearing routes,
 * so plaintext HTTP, URL userinfo, fragments, and secret-bearing query params
 * are never valid authoring or runtime configuration.
 */
export function validateOutboundBaseUrl(value: string): OutboundConfigIssue[] {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return [{ path: [], message: 'base_url must be an absolute URL' }];
  }
  const issues: OutboundConfigIssue[] = [];
  if (url.protocol !== 'https:') {
    issues.push({ path: [], message: 'base_url must use HTTPS' });
  }
  if (!url.hostname) {
    issues.push({ path: [], message: 'base_url must include a hostname' });
  }
  if (url.username || url.password) {
    issues.push({ path: [], message: 'base_url must not contain userinfo credentials' });
  }
  if (url.hash) {
    issues.push({ path: [], message: 'base_url must not contain a URL fragment' });
  }
  for (const key of url.searchParams.keys()) {
    if (isSensitiveUrlQueryKey(key)) {
      issues.push({
        path: ['query', key],
        message: `base_url query parameter "${key}" looks secret-like`,
      });
    }
  }
  return issues;
}

/** Iterative traversal avoids recursion limits for untrusted JSON configuration. */
export function validateNonSecretConfig(
  value: unknown,
  fieldName = 'configuration',
): OutboundConfigIssue[] {
  const issues: OutboundConfigIssue[] = [];
  const stack: Array<{ value: unknown; path: Array<string | number> }> = [{ value, path: [] }];
  const visited = new WeakSet<object>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (typeof current.value === 'string') {
      if (redactSecretText(current.value) !== current.value) {
        issues.push({ path: current.path, message: `${fieldName} contains secret-like text` });
      }
      continue;
    }
    if (!current.value || typeof current.value !== 'object') continue;
    if (visited.has(current.value)) continue;
    visited.add(current.value);
    if (Array.isArray(current.value)) {
      current.value.forEach((item, index) => {
        stack.push({ value: item, path: [...current.path, index] });
      });
      continue;
    }
    for (const [key, child] of Object.entries(current.value as Record<string, unknown>)) {
      const path = [...current.path, key];
      if (isSecretLikeConfigKey(key)) {
        issues.push({ path, message: `${fieldName} key "${key}" looks secret-like` });
      } else {
        stack.push({ value: child, path });
      }
    }
  }
  return issues;
}

export function validateNonSecretRequestConfig(value: unknown): OutboundConfigIssue[] {
  return validateNonSecretConfig(value, 'request_config');
}

export function outboundUrlOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    // Invalid legacy data must never be considered equivalent to another route.
    return `invalid:${value}`;
  }
}

export function redactSecretLikeValues<T>(value: T): T {
  return redactValue(value, new WeakMap<object, unknown>()) as T;
}

export function redactOutboundUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return REDACTED_SECRET;
  }
  let changed = Boolean(url.username || url.password);
  url.username = '';
  url.password = '';
  for (const key of [...url.searchParams.keys()]) {
    if (isSensitiveUrlQueryKey(key)) {
      url.searchParams.set(key, REDACTED_SECRET);
      changed = true;
    }
  }
  if (url.hash) {
    url.hash = REDACTED_SECRET;
    changed = true;
  }
  return changed ? url.toString() : value;
}

/** Redact common credentials even when they appear inside an otherwise ordinary string. */
export function redactSecretText(value: string): string {
  return value
    .replace(URL_IN_TEXT, (url) => redactOutboundUrl(url))
    .replace(SENSITIVE_HEADER_IN_TEXT, (_match, name: string) => `${name}: ${REDACTED_SECRET}`)
    .replace(AUTH_SCHEME_IN_TEXT, (_match, scheme: string) => `${scheme} ${REDACTED_SECRET}`)
    .replace(SECRET_ASSIGNMENT_IN_TEXT, (_match, prefix: string) => `${prefix}${REDACTED_SECRET}`);
}

/** Defense-in-depth for Task and RequestLog route persistence/API projection. */
export function sanitizeChannelRouteSnapshot(
  route: ChannelRouteSnapshot | null | undefined,
): ChannelRouteSnapshot | null {
  if (!route) return null;
  return {
    key: route.key,
    ...(route.base_url ? { base_url: redactOutboundUrl(route.base_url) } : {}),
    options: redactSecretLikeValues(route.options),
  };
}

function redactValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (typeof value === 'string') return redactSecretText(value);
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  const existing = seen.get(value);
  if (existing !== undefined) return existing;
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    seen.set(value, result);
    for (const item of value) result.push(redactValue(item, seen));
    return result;
  }
  const result: Record<string, unknown> = {};
  seen.set(value, result);
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    Object.defineProperty(result, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: isSecretLikeConfigKey(key) ? REDACTED_SECRET : redactValue(child, seen),
    });
  }
  return result;
}
