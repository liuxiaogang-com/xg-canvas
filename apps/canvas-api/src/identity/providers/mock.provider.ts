import { randomBytes } from 'node:crypto';

import type { ResolvedIdentity } from '../identity.service';
import type { AuthorizeParams, IdentityProvider, ResolveParams } from './identity-provider.interface';

/**
 * Dev-only fake OAuth provider. "authorize" redirects straight back to the
 * callback carrying a uid (the caller's hint, or a random one), so the whole
 * redirect login/bind/merge UX is exercisable with no real WeChat/Feishu creds.
 * A `union:` prefix on the hint also sets union_key, to demo unionid merging.
 */
export class MockProvider implements IdentityProvider {
  readonly key = 'mock';

  authorizeUrl({ state, redirectUri, hint }: AuthorizeParams): string {
    const uid = hint?.trim() || `mock-${randomBytes(4).toString('hex')}`;
    const u = new URL(redirectUri);
    u.searchParams.set('state', state);
    u.searchParams.set('mock_uid', uid);
    return u.toString();
  }

  async resolve({ query }: ResolveParams): Promise<ResolvedIdentity> {
    const raw = (query.mock_uid || '').trim();
    // "union:KEY:UID" lets you put several uids on one unionid to demo merging.
    let unionKey: string | null = null;
    let uid = raw;
    if (raw.startsWith('union:')) {
      const [, key, rest] = raw.split(':');
      unionKey = key || null;
      uid = rest || key;
    }
    return {
      provider: 'mock',
      providerUid: uid || `mock-${randomBytes(4).toString('hex')}`,
      unionKey,
      displayName: uid,
      rawProfile: { mock: true },
    };
  }
}
