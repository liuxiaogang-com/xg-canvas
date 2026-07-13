import type { ResolvedIdentity } from '../identity.service';

export interface AuthorizeParams {
  state: string;
  redirectUri: string;
  hint?: string; // optional caller-supplied tag (used by the dev mock provider)
}

export interface ResolveParams {
  query: Record<string, string>;
  redirectUri: string;
}

/**
 * A redirect-style OAuth login source. Implement `authorizeUrl` (where to send
 * the browser) and `resolve` (turn the callback into a ResolvedIdentity). New
 * providers (e.g. enterprise WeChat) are one file + one env block — see
 * docs/adapter-guide.md style. The dev `mock` provider implements both locally.
 */
export interface IdentityProvider {
  readonly key: string; // wechat_oa | wechat_open | feishu | mock | ...
  authorizeUrl(p: AuthorizeParams): string;
  resolve(p: ResolveParams): Promise<ResolvedIdentity>;
}
