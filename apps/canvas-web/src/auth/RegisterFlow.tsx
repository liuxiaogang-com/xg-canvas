import { useState } from 'react';

import { useAuthStore } from '../store/auth';
import { toast } from '../ui';

interface Props {
  onDone(): void;
}

export function RegisterFlow({ onDone }: Props) {
  const register = useAuthStore((state) => state.register);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 12) {
      toast.error('密码至少 12 位');
      return;
    }
    if (password !== confirm) {
      toast.error('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      await register(email.trim(), password, displayName.trim());
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="auth-forms" onSubmit={submit}>
      <div className="field">
        <label className="field__label" htmlFor="register-display-name">
          名称
        </label>
        <input
          id="register-display-name"
          name="displayName"
          className="input"
          autoComplete="name"
          minLength={2}
          maxLength={200}
          required
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="register-email">
          邮箱
        </label>
        <input
          id="register-email"
          name="email"
          className="input"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="register-password">
          密码
        </label>
        <input
          id="register-password"
          name="password"
          className="input"
          type="password"
          autoComplete="new-password"
          aria-describedby="register-password-hint"
          minLength={12}
          maxLength={128}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <span id="register-password-hint" className="field__hint">
          至少 12 位，建议使用密码管理器生成。
        </span>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="register-password-confirm">
          确认密码
        </label>
        <input
          id="register-password-confirm"
          name="passwordConfirm"
          className="input"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </div>
      <button type="submit" className="btn btn--primary gradient-btn !border-0 auth-cta" disabled={loading}>
        {loading ? <span className="spinner" /> : null}
        创建账号
      </button>
    </form>
  );
}
