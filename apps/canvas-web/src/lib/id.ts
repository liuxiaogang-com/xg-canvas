/**
 * Client-local opaque ids (device cookie, canvas nodes, handoff, conversations).
 * Not a credential. Do not use for Token, Session, or secrets.
 *
 * Priority:
 * 1. crypto.randomUUID (secure context)
 * 2. getRandomValues UUID v4 (works on LAN HTTP)
 * 3. timestamp + page seq + Math.random (non-crypto last resort)
 */

let weakSeq = 0;

function uuidFromBytes(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Non-crypto fallback when Web Crypto is missing. Not for Token / Session / keys. */
function weakClientId(): string {
  weakSeq += 1;
  return `c${Date.now().toString(36)}-${weakSeq.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createClientId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') {
    try {
      return c.randomUUID();
    } catch {
      /* insecure context may expose the method but throw */
    }
  }
  if (typeof c?.getRandomValues === 'function') {
    return uuidFromBytes(c.getRandomValues(new Uint8Array(16)));
  }
  return weakClientId();
}
