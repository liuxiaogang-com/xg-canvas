import { oauthStart } from '../api/auth';

/** Provider brand marks. Brand logos legitimately use their own brand color
 *  (the design-token rule's logo exception); everything else stays on tokens. */
function WeChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="#07C160" aria-hidden>
      <path d="M9 4.2C4.94 4.2 1.7 6.98 1.7 10.4c0 1.94 1.06 3.66 2.74 4.82l-.7 2.06 2.44-1.24c.87.24 1.8.38 2.76.4a4.9 4.9 0 0 1-.2-1.38c0-2.98 2.86-5.3 6.3-5.3l.52.02C15.9 6.5 12.78 4.2 9 4.2Zm-2.5 3.3a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9Zm5 0a.95.95 0 1 1 0 1.9.95.95 0 0 1 0-1.9Z" />
      <path d="M22.3 14.55c0-2.78-2.72-5.03-6.07-5.03s-6.08 2.25-6.08 5.03c0 2.79 2.72 5.04 6.08 5.04.78 0 1.53-.13 2.2-.35l2.02 1.03-.58-1.72c1.5-.94 2.43-2.34 2.43-3.99Zm-8.02-1.2a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Zm3.9 0a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Z" />
    </svg>
  );
}

function FeishuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12.6 3.7c-.5-.5-1.3-.5-1.7.1L4 13.2c2.6.2 5-1 6.6-3.2l1.2-1.6c.4-.5.3-1.2-.1-1.6l-.8-.8 1.7-2.3Z" fill="#3370FF" />
      <path d="M3.3 14.2c3.8 2.9 8.4 4.6 13.4 4.6 1.6 0 3.1-.6 4.2-1.7.4-.4.3-1-.2-1.3-3.3-1.7-6-4.2-8-7.3-.4-.6-1.2-.7-1.7-.2l-2 1.9c-1.7 1.6-4 2.5-6.4 2.4-.7 0-1 .9-.4 1.3l1.1.3Z" fill="#00D6B9" />
    </svg>
  );
}

function DevIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 8-4 4 4 4M15 8l4 4-4 4" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.4 2.5 15.6 0 18M12 3c-2.5 2.4-2.5 15.6 0 18" />
    </svg>
  );
}

const PROVIDERS: Record<string, { label: string; icon: JSX.Element }> = {
  wechat_open: { label: '微信登录', icon: <WeChatIcon /> },
  wechat_oa: { label: '微信登录', icon: <WeChatIcon /> },
  feishu: { label: '飞书登录', icon: <FeishuIcon /> },
  mock: { label: 'Mock 登录(开发)', icon: <DevIcon /> },
};

/** Row of round quick-login icons (WeChat redirects to its official QR page). */
export function QuickLogin({ keys }: { keys: string[] }) {
  if (!keys.length) return null;
  return (
    <div className="auth-quick">
      {keys.map((key) => {
        const p = PROVIDERS[key] ?? { label: key, icon: <GlobeIcon /> };
        return (
          <button
            key={key}
            type="button"
            className="auth-quick__btn"
            title={p.label}
            aria-label={p.label}
            onClick={() => {
              let hint: string | undefined;
              if (key === 'mock') {
                const v = window.prompt(
                  'Mock 用户标识(uid)。用 union:KEY:UID 可演示同一 unionid 归并:',
                  'mock-dev',
                );
                if (v === null) return;
                hint = v;
              }
              oauthStart(key, 'login', hint);
            }}
          >
            {p.icon}
          </button>
        );
      })}
    </div>
  );
}
