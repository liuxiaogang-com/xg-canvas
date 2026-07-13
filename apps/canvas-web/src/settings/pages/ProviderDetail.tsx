import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  SettingsPage, DataTable, Field, TextInput, BoolBadge, Badge, Loading, ErrorNote,
  type Column,
} from '../components/kit';
import { Modal, Select, toast } from '../../ui';
import { providerApi, channelApi, credentialApi } from '../api';
import type { Provider, Channel, CredentialView } from '../types';
import { ApiError } from '../../api/client';
import { VendorModelImport } from './VendorModelImport';

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : '操作失败');

const INVOCATION_OPTS = [
  { value: 'http', label: 'HTTP' },
  { value: 'cli', label: 'CLI 子进程' },
  { value: 'sdk', label: 'SDK' },
];
const CRED_TYPE_OPTS = [
  { value: 'api_key', label: 'API Key' },
  { value: 'oauth_token', label: 'OAuth Token' },
  { value: 'cookie', label: 'Cookie' },
];

const healthTone = (s: string): 'success' | 'danger' | 'warning' | 'default' =>
  s === 'healthy' ? 'success' : s === 'down' || s === 'unhealthy' ? 'danger' : s === 'degraded' ? 'warning' : 'default';

/* ── nested credential list for one channel ──────────────────── */
function CredentialRows({ channelId, refreshKey }: { channelId: string; refreshKey: number }) {
  const [rows, setRows] = useState<CredentialView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    credentialApi.listByChannel(channelId).then(setRows).catch(() => setRows([]));
  }, [channelId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const validate = async (id: string) => {
    setBusy(id);
    try {
      const r = await credentialApi.validate(id);
      r.is_valid ? toast.success('凭证有效') : toast.warning(r.validation_error ?? '凭证无效');
      load();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };
  const remove = async (id: string) => {
    if (!window.confirm('确认删除凭证？')) return;
    setBusy(id);
    try { await credentialApi.remove(id); toast.success('已删除'); load(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };

  if (rows === null) return <Loading label="加载凭证…" />;
  const cols: Column<CredentialView>[] = [
    { key: 'label', header: '标签', render: (r) => r.label ?? '-' },
    { key: 'credential_type', header: '类型' },
    { key: 'payload_fields', header: '字段', render: (r) => r.payload_fields.map((f) => <Badge key={f}>{f}</Badge>) },
    { key: 'is_valid', header: '有效', width: 80, render: (r) => <BoolBadge value={r.is_valid} on="有效" off="无效" /> },
    {
      key: 'actions', header: '操作', width: 140,
      render: (r) => (
        <div className="set-row-actions">
          <button className="btn btn--ghost btn--sm" disabled={busy === r.id} onClick={() => validate(r.id)}>
            {busy === r.id ? '处理中…' : '校验'}
          </button>
          <button className="btn btn--danger btn--sm" disabled={busy === r.id} onClick={() => remove(r.id)}>删除</button>
        </div>
      ),
    },
  ];
  return <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} empty="暂无凭证" />;
}

export default function ProviderDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [credBump, setCredBump] = useState(0);
  const [showAdv, setShowAdv] = useState(false);

  // channel modal
  const [chOpen, setChOpen] = useState(false);
  const [ch, setCh] = useState({ slug: '', display_name: '', invocation_method: 'http' });
  const [chBusy, setChBusy] = useState(false);

  // credential modal
  const [credFor, setCredFor] = useState<string | null>(null);
  const [credLabel, setCredLabel] = useState('');
  const [credType, setCredType] = useState('api_key');
  const [entries, setEntries] = useState<{ key: string; value: string }[]>([{ key: 'api_key', value: '' }]);
  const [credBusy, setCredBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [p, chs] = await Promise.all([providerApi.get(id), channelApi.listByProvider(id)]);
      setProvider(p); setChannels(chs);
    } catch (e) { setError(errMsg(e)); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const createChannel = async () => {
    setChBusy(true);
    try {
      await channelApi.create(id, ch);
      toast.success('渠道已创建');
      setChOpen(false); setCh({ slug: '', display_name: '', invocation_method: 'http' });
      load();
    } catch (e) { toast.error(errMsg(e)); } finally { setChBusy(false); }
  };
  const removeChannel = async (cid: string) => {
    if (!window.confirm('确认删除渠道？')) return;
    try { await channelApi.remove(cid); toast.success('已删除'); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };

  const openCred = (cid: string) => {
    setCredFor(cid); setCredLabel(''); setCredType('api_key');
    setEntries([{ key: 'api_key', value: '' }]);
  };
  const setEntry = (i: number, patch: Partial<{ key: string; value: string }>) =>
    setEntries((es) => es.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const createCred = async () => {
    if (!credFor) return;
    const payload: Record<string, string> = {};
    entries.forEach((e) => { if (e.key) payload[e.key] = e.value; });
    setCredBusy(true);
    try {
      await credentialApi.create(credFor, { label: credLabel || undefined, credential_type: credType, payload });
      toast.success('凭证已创建');
      setCredFor(null); setCredBump((n) => n + 1);
    } catch (e) { toast.error(errMsg(e)); } finally { setCredBusy(false); }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} />;
  if (!provider) return <ErrorNote message="未找到供应商" />;

  const chCols: Column<Channel>[] = [
    { key: 'display_name', header: '名称' },
    { key: 'invocation_method', header: '调用方式', render: (r) => <Badge tone="info">{r.invocation_method}</Badge> },
    { key: 'health_status', header: '健康', render: (r) => <Badge tone={healthTone(r.health_status)}>{r.health_status}</Badge> },
    { key: 'enabled', header: '启用', width: 80, render: (r) => <BoolBadge value={r.enabled} /> },
    {
      key: 'actions', header: '操作', width: 220,
      render: (r) => (
        <div className="set-row-actions">
          <button className="btn btn--ghost btn--sm" onClick={() => setExpanded((x) => (x === r.id ? null : r.id))}>
            {expanded === r.id ? '收起凭证' : '查看凭证'}
          </button>
          <button className="btn btn--secondary btn--sm" onClick={() => openCred(r.id)}>新增凭证</button>
          <button className="btn btn--danger btn--sm" onClick={() => removeChannel(r.id)}>删除</button>
        </div>
      ),
    },
  ];

  return (
    <SettingsPage
      title={provider.display_name ?? '供应商'}
      actions={<Link className="btn btn--ghost" to="/settings/providers">返回列表</Link>}
    >
      <dl className="set-detail-grid">
        <dt>名称</dt><dd>{provider.display_name}</dd>
        <dt>Slug</dt><dd>{provider.slug}</dd>
        <dt>认证方式</dt><dd>{provider.auth_method}</dd>
        <dt>Base URL</dt><dd>{provider.base_url ?? '-'}</dd>
        <dt>启用</dt><dd><BoolBadge value={provider.enabled} /></dd>
      </dl>

      <div className="set-section-title">模型</div>
      <div style={{ marginBottom: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
        <VendorModelImport
          providerId={id}
          onImported={() => toast.success('已加入「模型」列表，可在模型页查看')}
        />
        <span className="set-stat__sub">从厂商 /models 接口拉取，勾选启用后加入「模型」列表</span>
      </div>

      <div className="set-section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowAdv((v) => !v)}>
          高级:渠道与负载均衡 {showAdv ? '收起' : '展开'}
        </button>
        <span className="set-stat__sub">多 key 负载均衡 / 多端点(中转)/ 故障转移在此。普通接入用「凭证」页的添加向导即可。</span>
      </div>
      {showAdv ? (
        <>
          <div style={{ marginBottom: 8 }}>
            <button className="btn btn--primary btn--sm" onClick={() => setChOpen(true)}>新增渠道</button>
          </div>
          <DataTable columns={chCols} rows={channels} rowKey={(r) => r.id} empty="暂无渠道" />
          {expanded && channels.some((c) => c.id === expanded) ? (
            <div style={{ marginTop: 8 }}>
              <CredentialRows channelId={expanded} refreshKey={credBump} />
            </div>
          ) : null}
        </>
      ) : null}

      {/* 新增渠道 */}
      <Modal
        open={chOpen} onClose={() => setChOpen(false)} title="新增渠道"
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setChOpen(false)}>取消</button>
            <button className="btn btn--primary" disabled={chBusy || !ch.slug || !ch.display_name} onClick={createChannel}>
              {chBusy ? '处理中…' : '创建'}
            </button>
          </>
        }
      >
        <Field label="Slug"><TextInput value={ch.slug} onChange={(e) => setCh({ ...ch, slug: e.target.value })} /></Field>
        <Field label="名称"><TextInput value={ch.display_name} onChange={(e) => setCh({ ...ch, display_name: e.target.value })} /></Field>
        <Field label="调用方式">
          <Select value={ch.invocation_method} options={INVOCATION_OPTS} onChange={(v) => setCh({ ...ch, invocation_method: v })} />
        </Field>
      </Modal>

      {/* 新增凭证 */}
      <Modal
        open={credFor !== null} onClose={() => setCredFor(null)} title="新增凭证" width={560}
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setCredFor(null)}>取消</button>
            <button className="btn btn--primary" disabled={credBusy} onClick={createCred}>
              {credBusy ? '处理中…' : '创建'}
            </button>
          </>
        }
      >
        <Field label="标签" hint="可选"><TextInput value={credLabel} onChange={(e) => setCredLabel(e.target.value)} /></Field>
        <Field label="凭证类型">
          <Select value={credType} options={CRED_TYPE_OPTS} onChange={setCredType} />
        </Field>
        <Field label="凭证字段">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entries.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 8 }}>
                <TextInput placeholder="字段名" value={e.key} onChange={(ev) => setEntry(i, { key: ev.target.value })} style={{ width: 160 }} />
                <TextInput placeholder="值" type="password" value={e.value} onChange={(ev) => setEntry(i, { value: ev.target.value })} style={{ flex: 1 }} />
                <button className="btn btn--danger btn--sm" disabled={entries.length <= 1} onClick={() => setEntries((es) => es.filter((_, idx) => idx !== i))}>删除</button>
              </div>
            ))}
            <button className="btn btn--secondary btn--sm" onClick={() => setEntries((es) => [...es, { key: '', value: '' }])}>添加字段</button>
          </div>
        </Field>
      </Modal>
    </SettingsPage>
  );
}
