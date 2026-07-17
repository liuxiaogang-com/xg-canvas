import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { authApi, type AuthConfig } from '../api/auth';
import { useAuthStore } from '../store/auth';
import { LoginFlow } from './LoginFlow';
import { RegisterFlow } from './RegisterFlow';
import './AuthPage.css';

/** Brand glyph — a gradient node-graph tile (real SVG, theme-token colors). */
function AuthMark({ size = 38 }: { size?: number }) {
  return (
    <svg
      className="auth-brand__mark"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient
          id="xgcanvas-mark"
          x1="0"
          y1="0"
          x2="40"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--color-canvas-accent)" />
          <stop offset="1" stopColor="var(--color-cyan)" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="39" height="39" rx="11" fill="url(#xgcanvas-mark)" />
      <g stroke="#fff" strokeOpacity="0.92" strokeWidth="1.8" strokeLinecap="round">
        <path d="M13 14 L26 12" />
        <path d="M13 14 L20 27" />
        <path d="M20 27 L28 24" />
      </g>
      <g fill="#fff">
        <circle cx="13" cy="14" r="3.4" />
        <circle cx="27" cy="12" r="2.8" />
        <circle cx="20" cy="27" r="2.8" />
        <circle cx="28" cy="24" r="2.4" />
      </g>
    </svg>
  );
}

const FEATURES: { icon: JSX.Element; title: string; desc: string }[] = [
  {
    title: '节点式创作画布',
    desc: '拖拽连线,打通文本、图像、视频全链路',
    icon: (
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="6" height="5" rx="1.4" />
        <rect x="15" y="15" width="6" height="5" rx="1.4" />
        <path d="M9 6.5h4a2 2 0 0 1 2 2v9" />
      </svg>
    ),
  },
  {
    title: '多模型统一编排',
    desc: '文本、图像、视频模型一处接入',
    icon: (
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3 4 7l8 4 8-4-8-4Z" />
        <path d="M4 12l8 4 8-4M4 17l8 4 8-4" />
      </svg>
    ),
  },
  {
    title: '任务即真相',
    desc: '长任务落库,刷新页面进度不丢',
    icon: (
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
];

export default function AuthPage() {
  const [cfg, setCfg] = useState<AuthConfig | null>(null);
  const [cfgError, setCfgError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const nav = useNavigate();
  const [search] = useSearchParams();
  const auth = useAuthStore();

  useEffect(() => {
    setCfgError(false);
    authApi.config().then(setCfg).catch(() => setCfgError(true));
  }, [reloadKey]);

  const methods = cfg?.methods ?? [];
  const oauth = cfg?.oauth ?? [];

  return (
    <div className="auth-root">
      <aside className="auth-hero">
        <div className="auth-hero__glow" />
        <div className="auth-hero__grid" />

        <div className="auth-brand">
          <AuthMark />
          <span className="auth-brand__word">XG Canvas</span>
        </div>

        <div className="auth-hero__content">
          <h2 className="auth-hero__pitch">
            让灵感沿着<em>节点</em>流动,
            <br />
            从一句话到一支成片。
          </h2>
          <p className="auth-hero__sub">
            AI 创意项目管理与画布平台,把模型、任务与素材编织进同一张可协作的创作画布。
          </p>

          <ul className="auth-features">
            {FEATURES.map((f) => (
              <li className="auth-feature" key={f.title}>
                <span className="auth-feature__ic">{f.icon}</span>
                <span>
                  <strong>{f.title}</strong> · {f.desc}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="auth-hero__foot">Beta 开发版 · AGPL-3.0 开源 · 支持商业授权</div>
      </aside>

      <main className="auth-panel">
        <div className="auth-card">
          <div className="auth-card__brand auth-brand">
            <AuthMark size={32} />
            <span className="auth-brand__word">XG Canvas</span>
          </div>

          <h1 className="auth-card__title">{mode === 'login' ? '欢迎回来' : '创建账号'}</h1>
          <p className="auth-card__hint">
            {mode === 'login' ? '使用实例管理员已启用的登录方式进入系统。' : '使用邮箱和密码加入当前实例。'}
          </p>
          {search.get('setup') === 'completed' ? (
            <div className="auth-setup-notice" role="status">
              实例已完成初始化。请使用已创建的管理员账号登录。
            </div>
          ) : null}

          {cfgError ? (
            <div className="auth-forms">
              <div className="auth-config-error">无法读取登录配置，请确认 API 服务正常。</div>
              <button className="btn btn--secondary" onClick={() => setReloadKey((v) => v + 1)}>重试</button>
            </div>
          ) : cfg && mode === 'register' ? (
            <RegisterFlow onDone={() => nav('/projects')} />
          ) : cfg ? (
            <LoginFlow methods={methods} oauth={oauth} onDone={() => nav('/projects')} />
          ) : (
            <div className="auth-forms auth-loading">
              <span className="spinner" />
            </div>
          )}

          {cfg?.methods.includes('password') ? (
            <div className="auth-switch">
              <button
                type="button"
                className="auth-link"
                onClick={() => setMode((current) => (current === 'login' ? 'register' : 'login'))}
              >
                {mode === 'login' ? '没有账号？创建账号' : '已有账号？返回登录'}
              </button>
            </div>
          ) : null}

          {cfg?.mock && mode === 'login' ? (
            <div className="auth-dev">
              <span className="auth-dev__label">开发者入口</span>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={async () => {
                  await auth.devLogin();
                  nav('/projects');
                }}
              >
                跳过登录 (Demo)
              </button>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
