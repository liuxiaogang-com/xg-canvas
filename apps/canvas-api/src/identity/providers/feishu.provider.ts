import type { ResolvedIdentity } from '../identity.service';
import type { AuthorizeParams, IdentityProvider, ResolveParams } from './identity-provider.interface';
import { getJson, postJson } from './http';

/**
 * Feishu (Lark) OAuth. union_id stably identifies a person across the org's
 * apps, so providerUid=union_id (open_id kept for trace). Activated only when
 * FEISHU_APP_ID/SECRET are set. Needs real creds to test.
 */
export class FeishuProvider implements IdentityProvider {
  readonly key = 'feishu';

  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
  ) {}

  authorizeUrl({ state, redirectUri }: AuthorizeParams): string {
    const u = new URL('https://open.feishu.cn/open-apis/authen/v1/authorize');
    u.searchParams.set('app_id', this.appId);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('state', state);
    return u.toString();
  }

  async resolve({ query }: ResolveParams): Promise<ResolvedIdentity> {
    const code = query.code;
    if (!code) throw new Error('feishu: missing code');
    const appTok = await postJson('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
      app_id: this.appId,
      app_secret: this.appSecret,
    });
    const appAccess = appTok.app_access_token;
    if (!appAccess) throw new Error(`feishu app token: ${appTok.msg ?? 'failed'}`);
    const userTok = await postJson(
      'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token',
      { grant_type: 'authorization_code', code },
      { Authorization: `Bearer ${appAccess}` },
    );
    const userAccess = userTok.data?.access_token;
    if (!userAccess) throw new Error(`feishu user token: ${userTok.msg ?? 'failed'}`);
    const info = await getJson('https://open.feishu.cn/open-apis/authen/v1/user_info', {
      Authorization: `Bearer ${userAccess}`,
    });
    const d = info.data ?? {};
    const uid = d.union_id || d.open_id;
    if (!uid) throw new Error('feishu: no union_id/open_id');
    return {
      provider: 'feishu',
      providerUid: uid,
      unionKey: d.union_id ?? null,
      openid: d.open_id ?? null,
      appId: this.appId,
      displayName: d.name ?? null,
      avatarUrl: d.avatar_url ?? null,
      rawProfile: d,
    };
  }
}
