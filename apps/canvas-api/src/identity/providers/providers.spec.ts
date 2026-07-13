import { FeishuProvider } from './feishu.provider';
import { MockProvider } from './mock.provider';
import { WeChatProvider } from './wechat.provider';

describe('WeChatProvider.authorizeUrl', () => {
  const p = new WeChatProvider('wechat_oa', {
    appid: 'APPID',
    secret: 'SECRET',
    scope: 'snsapi_userinfo',
    authorizeBase: 'https://open.weixin.qq.com/connect/oauth2/authorize',
  });
  const url = p.authorizeUrl({ state: 'st', redirectUri: 'https://x/cb' });

  it('carries appid/scope/state/redirect_uri and ends with #wechat_redirect', () => {
    expect(url).toContain('appid=APPID');
    expect(url).toContain('scope=snsapi_userinfo');
    expect(url).toContain('state=st');
    expect(url).toContain('redirect_uri=https%3A%2F%2Fx%2Fcb');
    expect(url.endsWith('#wechat_redirect')).toBe(true);
  });
});

describe('FeishuProvider.authorizeUrl', () => {
  const url = new FeishuProvider('cli_x', 'sec').authorizeUrl({ state: 'st', redirectUri: 'https://x/cb' });
  it('targets Feishu authorize with app_id/state', () => {
    expect(url).toContain('open.feishu.cn');
    expect(url).toContain('app_id=cli_x');
    expect(url).toContain('state=st');
  });
});

describe('MockProvider.resolve', () => {
  const p = new MockProvider();
  it('takes a plain uid with no union', async () => {
    const r = await p.resolve({ query: { mock_uid: 'abc' }, redirectUri: '' });
    expect(r.providerUid).toBe('abc');
    expect(r.unionKey).toBeNull();
  });
  it('parses union:KEY:UID for unionid-merge demos', async () => {
    const r = await p.resolve({ query: { mock_uid: 'union:U1:openidA' }, redirectUri: '' });
    expect(r.providerUid).toBe('openidA');
    expect(r.unionKey).toBe('U1');
  });
});
