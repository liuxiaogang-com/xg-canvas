import { useEffect, useRef, useState } from 'react';

import { authApi } from '../api/auth';
import { useAuthStore } from '../store/auth';
import { Select, type SelectOption, toast } from '../ui';
import { QuickLogin } from './QuickLogin';
import './LoginFlow.css';

type Channel = 'phone' | 'email';
type Cred = 'code' | 'password';

const COUNTRY_CODES: SelectOption<string>[] = [
  { value: '+86', label: '+86 中国' },
  { value: '+852', label: '+852 香港' },
  { value: '+853', label: '+853 澳门' },
  { value: '+886', label: '+886 台湾' },
  { value: '+1', label: '+1 美国' },
  { value: '+44', label: '+44 英国' },
  { value: '+81', label: '+81 日本' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  methods: string[];
  oauth: string[];
  onDone(): void;
}

/** Identifier-first login: pick phone/email, continue, then password or code.
 *  New accounts are created implicitly by the code path (no separate register). */
export function LoginFlow({ methods, oauth, onDone }: Props) {
  const hasPassword = methods.includes('password');
  const hasEmailCode = methods.includes('email_code');
  const hasPhone = methods.includes('phone_code');
  const emailUsable = hasEmailCode || hasPassword;

  const [channel, setChannel] = useState<Channel>(hasPhone ? 'phone' : 'email');
  const [cc, setCc] = useState('+86');
  const [id, setId] = useState('');
  const [step, setStep] = useState<'identify' | 'credential'>('identify');
  const [cred, setCred] = useState<Cred>('code');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const applyAuth = useAuthStore((s) => s.applyAuth);
  const timer = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => () => clearInterval(timer.current), []);

  // The exact string sent to the backend for send/verify/login.
  const target = channel === 'phone' ? cc + id.replace(/\D/g, '') : id.trim();
  const idValid = channel === 'phone' ? /^\d{6,15}$/.test(id.replace(/\D/g, '')) : EMAIL_RE.test(id.trim());

  const startCountdown = () => {
    setCountdown(60);
    timer.current = setInterval(
      () => setCountdown((c) => (c <= 1 ? (clearInterval(timer.current), 0) : c - 1)),
      1000,
    );
  };

  const sendCode = async () => {
    try {
      const r =
        channel === 'email' ? await authApi.sendEmailCode(target) : await authApi.sendPhoneCode(target);
      startCountdown();
      if (r.devCode) {
        setCode(r.devCode);
        toast.info(`开发环境验证码:${r.devCode}`);
      } else {
        toast.success('验证码已发送');
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const goCredential = async () => {
    if (!idValid) {
      toast.error(channel === 'phone' ? '请输入有效手机号' : '请输入有效邮箱');
      return;
    }
    const mode: Cred = channel === 'phone' ? 'code' : hasEmailCode ? 'code' : 'password';
    setCred(mode);
    setStep('credential');
    if (mode === 'code') await sendCode();
  };

  const switchChannel = () => {
    setChannel((c) => (c === 'phone' ? 'email' : 'phone'));
    setId('');
  };

  const back = () => {
    setStep('identify');
    setCode('');
    setPassword('');
    setCountdown(0);
    clearInterval(timer.current);
  };

  const toggleCred = async (next: Cred) => {
    setCred(next);
    if (next === 'code' && countdown === 0) await sendCode();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cred === 'password' ? password.length < 8 : code.trim().length < 4) {
      toast.error(cred === 'password' ? '密码至少 8 位' : '请输入验证码');
      return;
    }
    setLoading(true);
    try {
      if (cred === 'password') {
        const r = await authApi.login(target, password);
        applyAuth(r);
      } else {
        const r =
          channel === 'email' ? await authApi.emailLogin(target, code) : await authApi.phoneLogin(target, code);
        applyAuth(r);
      }
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // ---------- step 1: identifier ----------
  if (step === 'identify') {
    return (
      <div className="auth-step">
        <form
          className="auth-forms"
          onSubmit={(e) => {
            e.preventDefault();
            void goCredential();
          }}
        >
          <div className="field">
            <label className="field__label">{channel === 'phone' ? '手机号' : '邮箱'}</label>
            {channel === 'phone' ? (
              <div className="auth-idrow">
                <Select className="auth-cc" value={cc} options={COUNTRY_CODES} onChange={setCc} />
                <input
                  className="input"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="请输入手机号"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                />
              </div>
            ) : (
              <input
                className="input"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={id}
                onChange={(e) => setId(e.target.value)}
              />
            )}
          </div>

          <button type="submit" className="btn btn--primary gradient-btn !border-0 auth-cta" disabled={!idValid}>
            继续
          </button>
        </form>

        {hasPhone && emailUsable ? (
          <div className="auth-switch">
            <button type="button" className="auth-link" onClick={switchChannel}>
              {channel === 'phone' ? '使用邮箱登录' : '使用手机号登录'}
            </button>
          </div>
        ) : null}

        {oauth.length > 0 ? (
          <>
            <div className="auth-divider">或使用以下方式登录</div>
            <QuickLogin keys={oauth} />
          </>
        ) : null}
      </div>
    );
  }

  // ---------- step 2: credential ----------
  const canSwitchCred = channel === 'email' && hasPassword && hasEmailCode;
  return (
    <div className="auth-step">
      <button type="button" className="auth-back" onClick={back}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m15 18-6-6 6-6" />
        </svg>
        <span className="auth-back__id">{channel === 'phone' ? cc + ' ' + id : id}</span>
      </button>

      <form className="auth-forms" onSubmit={submit}>
        {cred === 'password' ? (
          <div className="field">
            <label className="field__label">密码</label>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              placeholder="请输入密码"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        ) : (
          <div className="field">
            <label className="field__label">验证码</label>
            <div className="auth-coderow">
              <input
                className="input"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6 位验证码"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button
                type="button"
                className="btn btn--secondary auth-resend"
                disabled={countdown > 0}
                onClick={() => void sendCode()}
              >
                {countdown > 0 ? `${countdown}s` : '重新发送'}
              </button>
            </div>
          </div>
        )}

        <button type="submit" className="btn btn--primary gradient-btn !border-0 auth-cta" disabled={loading}>
          {loading && <span className="spinner" />}
          {cred === 'password' ? '登录' : '登录 / 注册'}
        </button>
      </form>

      {canSwitchCred ? (
        <div className="auth-alt">
          <button type="button" className="auth-link" onClick={() => void toggleCred(cred === 'password' ? 'code' : 'password')}>
            {cred === 'password' ? '改用验证码登录' : '改用密码登录'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
