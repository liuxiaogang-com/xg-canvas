import type { ResolvedIdentity } from '../identity.service';
import type { AuthorizeParams, IdentityProvider, ResolveParams } from './identity-provider.interface';
import { getJson } from './http';

export interface WeChatConfig {
  appid: string;
  secret: string;
  scope: string; // snsapi_userinfo (服务号) | snsapi_login (开放平台扫码)
  authorizeBase: string;
}

/**
 * WeChat web OAuth (服务号 oauth2 / 开放平台 qrconnect). Same person across
 * WeChat apps shares a unionid, so providerUid prefers unionid over openid and
 * union_key=unionid drives cross-app merging in IdentityService.findOrCreate.
 * Activated only when WECHAT_*_APPID/SECRET are set. Needs real creds to test.
 */
export class WeChatProvider implements IdentityProvider {
  constructor(
    readonly key: string,
    private readonly cfg: WeChatConfig,
  ) {}

  authorizeUrl({ state, redirectUri }: AuthorizeParams): string {
    const u = new URL(this.cfg.authorizeBase);
    u.searchParams.set('appid', this.cfg.appid);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', this.cfg.scope);
    u.searchParams.set('state', state);
    return `${u.toString()}#wechat_redirect`;
  }

  async resolve({ query }: ResolveParams): Promise<ResolvedIdentity> {
    const code = query.code;
    if (!code) throw new Error('wechat: missing code');
    const tok = await getJson(
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${this.cfg.appid}` +
        `&secret=${this.cfg.secret}&code=${code}&grant_type=authorization_code`,
    );
    if (tok.errcode) throw new Error(`wechat token: ${tok.errmsg}`);
    const openid: string = tok.openid;
    let unionid: string | null = tok.unionid ?? null;
    let nickname: string | null = null;
    let avatar: string | null = null;
    if (this.cfg.scope.includes('userinfo')) {
      const info = await getJson(
        `https://api.weixin.qq.com/sns/userinfo?access_token=${tok.access_token}&openid=${openid}&lang=zh_CN`,
      );
      if (!info.errcode) {
        nickname = info.nickname ?? null;
        avatar = info.headimgurl ?? null;
        unionid = info.unionid ?? unionid;
      }
    }
    return {
      provider: this.key,
      providerUid: unionid || openid,
      unionKey: unionid,
      openid,
      appId: this.cfg.appid,
      displayName: nickname,
      avatarUrl: avatar,
      rawProfile: { openid, unionid },
    };
  }
}
