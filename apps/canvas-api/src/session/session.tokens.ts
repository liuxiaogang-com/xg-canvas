import { createHash, randomBytes } from 'node:crypto';

/**
 * Opaque session token: a 256-bit URL-safe random string. It carries NO data —
 * it is only a lookup key into canvas.auth_sessions / Redis. Revocable instantly
 * because the truth lives server-side (unlike a self-contained JWT).
 */
export function genOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** sha256(token) as a Buffer — stored in auth_sessions.token_hash (BYTEA). */
export function sha256(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export function toHex(buf: Buffer): string {
  return buf.toString('hex');
}
