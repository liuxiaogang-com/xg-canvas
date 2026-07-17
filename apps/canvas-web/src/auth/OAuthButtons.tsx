import { oauthStart } from '../api/auth';

const LABELS: Record<string, string> = {
  wechat_oa: '微信登录',
  wechat_open: '微信扫码登录',
  feishu: '飞书登录',
};

/** Renders one full-page-redirect button per available OAuth provider key. */
export function OAuthButtons({ keys, mode = 'login' }: { keys: string[]; mode?: 'login' | 'bind' }) {
  if (!keys.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          className="btn btn--secondary"
          style={{ width: '100%' }}
          onClick={() => oauthStart(key, mode)}
        >
          {mode === 'bind' ? '绑定 ' : ''}
          {LABELS[key] ?? key}
        </button>
      ))}
    </div>
  );
}
