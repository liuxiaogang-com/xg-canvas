import type { AuthIdentity } from '../database/entities';
import { identityLabel, loginMethodCount } from './identity-helpers';

let seq = 0;
const ident = (p: Partial<AuthIdentity>): AuthIdentity =>
  ({
    id: `id-${seq++}`,
    user_id: 'u',
    provider: 'email',
    provider_uid: 'x',
    union_key: null,
    app_id: null,
    openid: null,
    verified_at: new Date(),
    secret_hash: null,
    raw_profile: {},
    last_authenticated_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...p,
  }) as AuthIdentity;

describe('loginMethodCount', () => {
  it('counts password', () => {
    expect(loginMethodCount([ident({ provider: 'password' })])).toBe(1);
  });
  it('does not count an unverified email/phone', () => {
    expect(loginMethodCount([ident({ provider: 'email', verified_at: null })])).toBe(0);
    expect(loginMethodCount([ident({ provider: 'phone', verified_at: null })])).toBe(0);
  });
  it('counts a verified email', () => {
    expect(loginMethodCount([ident({ provider: 'email', verified_at: new Date() })])).toBe(1);
  });
  it('counts the WeChat family once', () => {
    expect(loginMethodCount([ident({ provider: 'wechat_mp' }), ident({ provider: 'wechat_oa' })])).toBe(1);
  });
  it('counts distinct groups', () => {
    const rows = [
      ident({ provider: 'password' }),
      ident({ provider: 'email', verified_at: new Date() }),
      ident({ provider: 'wechat_mp' }),
      ident({ provider: 'feishu' }),
    ];
    expect(loginMethodCount(rows)).toBe(4);
  });
  it('honors excludeId (drops to zero)', () => {
    const a = ident({ provider: 'password' });
    expect(loginMethodCount([a], a.id)).toBe(0);
  });
});

describe('identityLabel', () => {
  it('shows the uid for email/phone/password', () => {
    expect(identityLabel(ident({ provider: 'email', provider_uid: 'a@b.com' }))).toBe('a@b.com');
  });
  it('uses raw_profile.displayName for oauth', () => {
    expect(
      identityLabel(ident({ provider: 'mock', provider_uid: 'openid1', raw_profile: { displayName: '昵称' } })),
    ).toBe('昵称');
  });
  it('falls back to uid when no displayName', () => {
    expect(identityLabel(ident({ provider: 'mock', provider_uid: 'openid1', raw_profile: {} }))).toBe('openid1');
  });
});
