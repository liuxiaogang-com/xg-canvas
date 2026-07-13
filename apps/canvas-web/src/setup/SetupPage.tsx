import { FormEvent, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { setupApi } from '../api/auth';
import { useAuthStore } from '../store/auth';
import './setup.css';

interface SetupContext {
  finishSetup(): void;
}

export default function SetupPage() {
  const nav = useNavigate();
  const { finishSetup } = useOutletContext<SetupContext>();
  const applyAuth = useAuthStore((s) => s.applyAuth);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError('两次输入的密码不一致');
    setSaving(true);
    setError(null);
    try {
      const result = await setupApi.complete({
        email: email.trim(), password, display_name: displayName.trim(),
      });
      applyAuth(result);
      finishSetup();
      nav('/settings?welcome=1', { replace: true });
    } catch (err) {
      // The DB transaction may have committed even if session issuance failed,
      // or another browser may have won the setup race. Never leave a closed
      // setup page pretending it is still retryable.
      const status = await setupApi.status().catch(() => null);
      if (status && !status.required) {
        finishSetup();
        nav('/auth?setup=completed', { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : '初始化失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="setup-root">
      <main className="setup-card">
        <div className="setup-brand">XG Canvas</div>
        <p className="setup-step">首次启动 · 创建实例管理员</p>
        <h1>初始化你的 XG Canvas</h1>
        <p className="setup-hint">
          该账号是本实例的紧急恢复管理员。初始化完成后可在后台配置对象存储、模型凭证和扫码登录。
        </p>
        <p className="setup-security-note">
          请仅在可信网络中完成初始化，并在完成后再开放公网入口。该入口成功使用一次后会永久关闭。
        </p>

        <form className="setup-form" onSubmit={submit} aria-busy={saving}>
          <label className="field">
            <span className="field__label">管理员名称</span>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} minLength={2} maxLength={200} required autoComplete="name" />
          </label>
          <label className="field">
            <span className="field__label">管理员邮箱</span>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            <span className="field__hint">作为本地登录标识，初始化时不发送验证邮件。</span>
          </label>
          <div className="setup-passwords">
            <label className="field">
              <span className="field__label">密码</span>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} maxLength={128} required autoComplete="new-password" />
              <span className="field__hint">至少 12 位，建议使用密码管理器生成。</span>
            </label>
            <label className="field">
              <span className="field__label">确认密码</span>
              <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={12} maxLength={128} required autoComplete="new-password" />
            </label>
          </div>
          {error ? <div className="setup-error" role="alert">{error}</div> : null}
          <button className="btn btn--primary setup-submit" disabled={saving} type="submit">
            {saving ? '正在初始化…' : '创建管理员并进入配置'}
          </button>
        </form>
      </main>
    </div>
  );
}
