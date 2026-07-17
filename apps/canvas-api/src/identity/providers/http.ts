import { readBoundedJson } from '../../common/http/bounded-body';
import { guardedFetch } from '../../common/http/guarded-outbound';

const MAX_OAUTH_BODY_BYTES = 256 * 1024;

/** Tiny bounded JSON fetch helpers for provider token/userinfo calls. */
export async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const res = await guardedFetch(url, { headers });
  return readBoundedJson(res, MAX_OAUTH_BODY_BYTES);
}

export async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<any> {
  const res = await guardedFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return readBoundedJson(res, MAX_OAUTH_BODY_BYTES);
}
