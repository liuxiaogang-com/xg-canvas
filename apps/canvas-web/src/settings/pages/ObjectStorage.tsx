import { useEffect, useState } from 'react';
import { objectStorageApi, type ObjectStorageInput } from '../api';
import { Badge, ErrorNote, Field, Loading, SettingsPage, TextInput } from '../components/kit';
import { SecretInput } from '../components/SecretInput';
import { toast } from '../../ui';
import { useReadinessStore } from '../../readiness/store';

const emptyPublic: {
  endpoint: string;
  port?: number;
  use_ssl: boolean;
  force_path_style: boolean;
  region: string;
  bucket: string;
  browser_s3_endpoint: string;
} = {
  endpoint: '',
  use_ssl: true,
  force_path_style: true,
  region: 'us-east-1',
  bucket: '',
  browser_s3_endpoint: '',
};

export default function ObjectStorage() {
  const [form, setForm] = useState({ ...emptyPublic });
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [accessDirty, setAccessDirty] = useState(false);
  const [secretDirty, setSecretDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [verified, setVerified] = useState(false);
  const invalidate = useReadinessStore((s) => s.invalidate);

  useEffect(() => {
    objectStorageApi
      .get()
      .then((value) => {
        setConfigured(value.configured);
        setVerified(!!value.verified);
        setForm({
          endpoint: value.endpoint ?? '',
          port: value.port,
          use_ssl: value.use_ssl ?? true,
          force_path_style: value.force_path_style ?? true,
          region: value.region ?? 'us-east-1',
          bucket: value.bucket ?? '',
          browser_s3_endpoint: value.browser_s3_endpoint ?? '',
        });
        resetSecrets();
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  function resetSecrets() {
    setAccessKey('');
    setSecretKey('');
    setAccessDirty(false);
    setSecretDirty(false);
  }

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  function buildBody(): ObjectStorageInput {
    const body: ObjectStorageInput = {
      endpoint: form.endpoint,
      port: form.port,
      use_ssl: form.use_ssl,
      force_path_style: form.force_path_style,
      region: form.region,
      bucket: form.bucket,
      browser_s3_endpoint: form.browser_s3_endpoint || undefined,
    };
    if (accessDirty && accessKey.trim()) body.access_key = accessKey.trim();
    if (secretDirty && secretKey.trim()) body.secret_key = secretKey.trim();
    return body;
  }

  const run = async (save: boolean) => {
    if (!configured) {
      if (!accessKey.trim() || !secretKey.trim()) {
        setError('首次配置需要填写 Access key 与 Secret key');
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const body = buildBody();
      if (save) {
        const result = await objectStorageApi.update(body);
        setConfigured(result.configured);
        setVerified(!!result.verified);
        resetSecrets();
        toast.success('已保存，请测试连通以完成就绪');
        void invalidate();
      } else {
        const result = await objectStorageApi.test(body);
        setConfigured(result.configured);
        setVerified(!!result.verified);
        resetSecrets();
        toast.success('连接成功');
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
      <Badge tone="success">服务端读写已验证</Badge>
    ) : (
      <Badge tone="warning">已保存，未验证</Badge>
    );

  return (
    <SettingsPage
      title="对象存储"
      description="配置生成资产使用的 S3/R2 兼容存储。未修改的密钥将继续使用已保存值。"
      actions={
        <>
          {status}
          <button className="btn" disabled={saving} onClick={() => void run(false)}>
            测试并保存
          </button>
          <button className="btn btn--primary" disabled={saving} onClick={() => void run(true)}>
            保存
          </button>
        </>
      }
    >
      {error ? <ErrorNote message={error} /> : null}
      <p className="set-hint" style={{ marginBottom: 12, fontSize: 13, lineHeight: 1.5, opacity: 0.85 }}>
        浏览器直传（参考图上传）要求桶开启 CORS。Cloudflare R2 → Bucket → Settings → CORS
        至少允许 Origin <code>http://localhost:5180</code>（及正式站点 Origin）、Methods{' '}
        <code>GET, PUT, HEAD</code>、Headers <code>Content-Type</code>。仅「测试连接」成功不够，未配 CORS
        时前端 PUT 会被浏览器拦截。
      </p>
      <div className="set-storage-form">
        <Field label="服务端 S3 Endpoint">
          <TextInput
            value={form.endpoint}
            onChange={(e) => set('endpoint', e.target.value)}
            placeholder="https://<account>.r2.cloudflarestorage.com"
          />
        </Field>
        <Field label="Port" hint="Endpoint 已包含端口时留空">
          <TextInput
            type="number"
            min={1}
            max={65535}
            value={form.port ?? ''}
            onChange={(e) => set('port', e.target.value ? Number(e.target.value) : undefined)}
          />
        </Field>
        <Field label="Region">
          <TextInput value={form.region} onChange={(e) => set('region', e.target.value)} />
        </Field>
        <Field label="Bucket">
          <TextInput value={form.bucket} onChange={(e) => set('bucket', e.target.value)} />
        </Field>
        <Field
          label="浏览器 S3 Endpoint"
          hint="可选；供浏览器 GET/PUT 签名使用，必须是支持 SigV4 的 S3 API 地址，不是 CDN/公开桶域名"
        >
          <TextInput
            value={form.browser_s3_endpoint ?? ''}
            onChange={(e) => set('browser_s3_endpoint', e.target.value)}
            placeholder="https://<account>.r2.cloudflarestorage.com"
          />
        </Field>
        <SecretInput
          label="Access key"
          configured={configured}
          value={accessKey}
          dirty={accessDirty}
          onChange={setAccessKey}
          onBeginEdit={() => setAccessDirty(true)}
        />
        <SecretInput
          label="Secret key"
          configured={configured}
          value={secretKey}
          dirty={secretDirty}
          onChange={setSecretKey}
          onBeginEdit={() => setSecretDirty(true)}
        />
        <label className="set-filter-check">
          <input
            type="checkbox"
            checked={form.use_ssl}
            onChange={(e) => set('use_ssl', e.target.checked)}
          />
          使用 SSL
        </label>
        <label className="set-filter-check">
          <input
            type="checkbox"
            checked={form.force_path_style}
            onChange={(e) => set('force_path_style', e.target.checked)}
          />
          Force path style
        </label>
      </div>
    </SettingsPage>
  );
}
