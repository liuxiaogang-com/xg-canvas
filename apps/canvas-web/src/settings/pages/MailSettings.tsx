import { useEffect, useState } from 'react';
import { smtpApi, type SmtpInput } from '../api';
import { Badge, ErrorNote, Field, Loading, SettingsPage, TextInput } from '../components/kit';
import { SecretInput } from '../components/SecretInput';
import { toast } from '../../ui';
import { useReadinessStore } from '../../readiness/store';

const emptyPublic = {
  host: '',
  port: 465,
  secure: true,
  from: '',
};

export default function MailSettings() {
  const [form, setForm] = useState({ ...emptyPublic });
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [userDirty, setUserDirty] = useState(false);
  const [passDirty, setPassDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [verified, setVerified] = useState(false);
  const invalidate = useReadinessStore((s) => s.invalidate);

  useEffect(() => {
    smtpApi
      .get()
      .then((value) => {
        setConfigured(value.configured);
        setVerified(!!value.verified);
        setForm({
          host: value.host ?? '',
          port: value.port ?? 465,
          secure: value.secure ?? true,
          from: value.from ?? '',
        });
        resetSecrets();
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  function resetSecrets() {
    setUser('');
    setPass('');
    setUserDirty(false);
    setPassDirty(false);
  }

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  function buildBody(): SmtpInput {
    const body: SmtpInput = {
      host: form.host,
      port: form.port,
      secure: form.secure,
      from: form.from,
    };
    if (userDirty && user.trim()) body.user = user.trim();
    if (passDirty && pass.trim()) body.pass = pass.trim();
    return body;
  }

  const run = async (save: boolean) => {
    if (!configured) {
      if (!user.trim() || !pass.trim()) {
        setError('首次配置需要填写 SMTP 用户名与密码');
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const body = buildBody();
      if (save) {
        const result = await smtpApi.update(body);
        setConfigured(result.configured);
        setVerified(!!result.verified);
        resetSecrets();
        toast.success('已保存，请测试连通以完成就绪');
        void invalidate();
      } else {
        const result = await smtpApi.test(body);
        setConfigured(result.configured);
        setVerified(!!result.verified);
        resetSecrets();
        toast.success('SMTP 连通成功');
        void invalidate();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  const status =
    !configured ? (
      <Badge>未配置</Badge>
    ) : verified ? (
      <Badge tone="success">已验证</Badge>
    ) : (
      <Badge tone="warning">已保存，未验证</Badge>
    );

  return (
    <SettingsPage
      title="邮件"
      description="配置 SMTP，用于验证码、通知等。未修改的账号密码将继续使用已保存值。"
      actions={
        <>
          {status}
          <button className="btn" disabled={saving} onClick={() => void run(false)}>
            测试连接
          </button>
          <button className="btn btn--primary" disabled={saving} onClick={() => void run(true)}>
            保存
          </button>
        </>
      }
    >
      {error ? <ErrorNote message={error} /> : null}
      <div className="set-storage-form">
        <Field label="SMTP Host">
          <TextInput
            value={form.host}
            onChange={(e) => set('host', e.target.value)}
            placeholder="smtp.example.com"
          />
        </Field>
        <Field label="Port">
          <TextInput
            type="number"
            value={form.port ?? 465}
            onChange={(e) => set('port', Number(e.target.value) || 465)}
          />
        </Field>
        <Field label="发件人 From">
          <TextInput
            value={form.from}
            onChange={(e) => set('from', e.target.value)}
            placeholder="noreply@example.com"
          />
        </Field>
        <div />
        <SecretInput
          label="用户名"
          configured={configured}
          value={user}
          dirty={userDirty}
          onChange={setUser}
          onBeginEdit={() => setUserDirty(true)}
          autoComplete="off"
        />
        <SecretInput
          label="密码"
          configured={configured}
          value={pass}
          dirty={passDirty}
          onChange={setPass}
          onBeginEdit={() => setPassDirty(true)}
        />
        <label className="set-filter-check">
          <input
            type="checkbox"
            checked={!!form.secure}
            onChange={(e) => set('secure', e.target.checked)}
          />
          使用 SSL/TLS（通常 465 开启）
        </label>
      </div>
    </SettingsPage>
  );
}
