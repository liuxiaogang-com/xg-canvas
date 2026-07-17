import { createHash } from 'node:crypto';

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value, '$', new WeakSet<object>()));
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Locale-independent UTF-16 code-unit order, stable across Windows and Alpine. */
export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalize(value: unknown, path: string, ancestors: WeakSet<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must be a finite JSON number`);
    return value;
  }
  if (Array.isArray(value)) {
    assertNotCircular(value, path, ancestors);
    const result = value.map((item, index) => canonicalize(item, `${path}[${index}]`, ancestors));
    ancestors.delete(value);
    return result;
  }
  if (!isRecord(value)) throw new TypeError(`${path} contains a non-JSON value`);
  if (!isPlainRecord(value)) throw new TypeError(`${path} must be a plain JSON object`);
  assertNotCircular(value, path, ancestors);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child !== undefined) out[key] = canonicalize(child, `${path}.${key}`, ancestors);
  }
  ancestors.delete(value);
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlainRecord(value: Record<string, unknown>): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertNotCircular(value: object, path: string, ancestors: WeakSet<object>): void {
  if (ancestors.has(value)) throw new TypeError(`${path} contains a circular reference`);
  ancestors.add(value);
}
