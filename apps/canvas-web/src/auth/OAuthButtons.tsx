import { oauthStart } from '../api/auth';

const LABELS: Record<string, string> = {
  wechat_oa: '微信登录',
  wechat_open: '微信扫码登录',
  feishu: '飞书登录',
  mock: 'Mock 登录（开发）',
};

/** Renders one full-page-redirect button per available OAuth provider key. The
 *  dev `mock` provider prompts for a uid so multi-identity/merge is testable. */
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
          onClick={() => {
            let hint: string | undefined;
            if (key === 'mock') {
              const v = window.prompt(
                'Mock 用户标识（uid）。用 union:KEY:UID 可演示同一 unionid 归并：',
                `mock-${Math.random().toString(36).slice(2, 8)}`,
              );
              if (v === null) return;
              hint = v;
            }
            oauthStart(key, mode, hint);
          }}
        >
          {mode === 'bind' ? '绑定 ' : ''}
          {LABELS[key] ?? key}
        </button>
      ))}
    </div>
  );
}
