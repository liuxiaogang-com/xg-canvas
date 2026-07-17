import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  SettingsPage, DataTable, Field, TextInput, BoolBadge, Badge, Loading, ErrorNote,
  type Column,
} from '../components/kit';
import { Modal, Select, toast } from '../../ui';
import { providerApi, channelApi, credentialApi } from '../api';
import type { Provider, Channel } from '../types';
import { ApiError } from '../../api/client';
import { VendorModelImport } from './VendorModelImport';
import { CatalogOriginBadge } from '../components/CatalogOriginBadge';
import { ProviderCredentialRows } from '../components/ProviderCredentialRows';
import { useCan } from '../../store/permissions';

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : '操作失败');

const INVOCATION_OPTS = [
  { value: 'http', label: 'HTTP' },
  { value: 'cli', label: 'CLI 子进程' },
  { value: 'sdk', label: 'SDK' },
];
export default function ProviderDetail() {
  const { id: providerResourceUid = '' } = useParams<{ id: string }>();
  const can = useCan();
  const canManageCredentials = can('system.credential.manage');
  const [provider, setProvider] = useState<Provider | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [credBump, setCredBump] = useState(0);
  const [showAdv, setShowAdv] = useState(false);
  const [providerBusy, setProviderBusy] = useState(false);
  const [channelBusy, setChannelBusy] = useState<string | null>(null);

  // channel modal
  const [chOpen, setChOpen] = useState(false);
  const [ch, setCh] = useState({
    slug: '', display_name: '', invocation_method: 'http', adapter_key: '',
  });
  const [chBusy, setChBusy] = useState(false);

  // credential modal
  const [credFor, setCredFor] = useState<string | null>(null);
  const [credLabel, setCredLabel] = useState('');
  const [credApiKey, setCredApiKey] = useState('');
  const [credBusy, setCredBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [p, chs] = await Promise.all([
        providerApi.get(providerResourceUid),
        channelApi.listByProvider(providerResourceUid),
      ]);
      setProvider(p); setChannels(chs);
    } catch (e) { setError(errMsg(e)); } finally { setLoading(false); }
  }, [providerResourceUid]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!canManageCredentials) {
      setExpanded(null);
      setCredFor(null);
    }
  }, [canManageCredentials]);

  const createChannel = async () => {
    setChBusy(true);
    try {
      await channelApi.create(providerResourceUid, {
        slug: ch.slug,
        display_name: ch.display_name,
        invocation_method: ch.invocation_method,
        adapter_keys: [ch.adapter_key],
        enabled: true,
      });
      toast.success('渠道已创建');
      setChOpen(false);
      setCh({ slug: '', display_name: '', invocation_method: 'http', adapter_key: '' });
      load();
    } catch (e) { toast.error(errMsg(e)); } finally { setChBusy(false); }
  };
  const removeChannel = async (cid: string) => {
    if (!window.confirm('确认删除渠道？')) return;
    try { await channelApi.remove(cid); toast.success('已删除'); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const toggleProvider = async () => {
    if (!provider) return;
    setProviderBusy(true);
    try {
      await providerApi.update(provider.resource_uid, { enabled: !provider.enabled });
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setProviderBusy(false);
    }
  };
  const toggleChannel = async (channel: Channel) => {
    setChannelBusy(channel.resource_uid);
    try {
      await channelApi.update(channel.resource_uid, { enabled: !channel.enabled });
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setChannelBusy(null);
    }
  };

  const openCred = (cid: string) => {
    if (!canManageCredentials || provider?.auth_method !== 'api_key') return;
    setCredFor(cid); setCredLabel(''); setCredApiKey('');
  };
  const createCred = async () => {
    if (!canManageCredentials || !credFor || !credApiKey.trim()) return;
    setCredBusy(true);
    try {
      await credentialApi.create(credFor, {
        label: credLabel || undefined,
        credential_type: 'api_key',
        payload: { api_key: credApiKey.trim() },
      });
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
    {
      key: 'adapter_keys', header: '协议 Adapter',
      render: (r) => r.adapter_keys.map((key) => <Badge key={key}>{key}</Badge>),
    },
    { key: 'origin', header: '来源', render: (r) => <CatalogOriginBadge origin={r.origin} /> },
    { key: 'enabled', header: '启用', width: 80, render: (r) => <BoolBadge value={r.enabled} /> },
    {
      key: 'actions', header: '操作', width: canManageCredentials ? 290 : 150,
      render: (r) => (
        <div className="set-row-actions">
          <button
            className="btn btn--ghost btn--sm"
            disabled={channelBusy === r.resource_uid}
            onClick={() => toggleChannel(r)}
          >
            {r.enabled ? '停用' : '启用'}
          </button>
          {canManageCredentials ? (
            <>
              <button className="btn btn--ghost btn--sm" onClick={() => setExpanded((x) => (
                x === r.resource_uid ? null : r.resource_uid
              ))}>
                {expanded === r.resource_uid ? '收起凭证' : '查看凭证'}
              </button>
              {provider.auth_method === 'api_key' ? (
                <button className="btn btn--secondary btn--sm" onClick={() => openCred(r.resource_uid)}>
                  新增凭证
                </button>
              ) : null}
            </>
          ) : null}
          {r.origin.kind === 'local' ? (
            <button className="btn btn--danger btn--sm" onClick={() => removeChannel(r.resource_uid)}>退役</button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <SettingsPage
      title={provider.display_name ?? '供应商'}
      actions={
        <>
          <Link className="btn btn--ghost" to="/settings/providers">返回列表</Link>
          <button className="btn btn--secondary" onClick={toggleProvider} disabled={providerBusy}>
            {providerBusy ? '处理中…' : provider.enabled ? '停用供应商' : '启用供应商'}
          </button>
        </>
      }
    >
      <dl className="set-detail-grid">
        <dt>名称</dt><dd>{provider.display_name}</dd>
        <dt>Slug</dt><dd>{provider.slug}</dd>
        <dt>认证方式</dt><dd>{provider.auth_method}</dd>
        <dt>Base URL</dt><dd>{provider.base_url ?? '-'}</dd>
        <dt>来源</dt><dd><CatalogOriginBadge origin={provider.origin} /></dd>
        <dt>资源 ID</dt><dd><code>{provider.origin.resource_uid}</code></dd>
        <dt>修订 ID</dt><dd><code>{provider.origin.revision_id}</code></dd>
        {provider.origin.release_id ? <><dt>发布 ID</dt><dd><code>{provider.origin.release_id}</code></dd></> : null}
        <dt>启用</dt><dd><BoolBadge value={provider.enabled} /></dd>
      </dl>

      <div className="set-section-title">模型</div>
      <div style={{ marginBottom: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
        {canManageCredentials ? (
          <>
            <VendorModelImport
              providerResourceUid={providerResourceUid}
              channels={channels}
              onImported={() => toast.success('已加入「模型」列表，可在模型页查看')}
            />
            <span className="set-stat__sub">从厂商 /models 接口拉取，勾选启用后加入「模型」列表</span>
          </>
        ) : (
          <span className="set-stat__sub">需要凭证管理权限才能读取厂商模型。</span>
        )}
      </div>

      <div className="set-section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowAdv((v) => !v)}>
          高级：渠道管理 {showAdv ? '收起' : '展开'}
        </button>
        <span className="set-stat__sub">多端点与多凭证故障转移在此配置。普通接入使用「凭证」页的添加向导即可。</span>
      </div>
      {showAdv ? (
        <>
          {!canManageCredentials ? (
            <div className="set-stat__sub" style={{ marginBottom: 8 }}>
              当前账号没有凭证管理权限，凭证查看与变更操作已隐藏。
            </div>
          ) : null}
          <div style={{ marginBottom: 8 }}>
            <button
              className="btn btn--primary btn--sm"
              onClick={() => {
                setCh((value) => ({ ...value, adapter_key: provider.adapter_keys[0] ?? '' }));
                setChOpen(true);
              }}
            >新增渠道</button>
          </div>
          <DataTable columns={chCols} rows={channels} rowKey={(r) => r.resource_uid} empty="暂无渠道" />
          {canManageCredentials && expanded && channels.some((c) => c.resource_uid === expanded) ? (
            <div style={{ marginTop: 8 }}>
              <ProviderCredentialRows channelResourceUid={expanded} refreshKey={credBump} />
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
            <button
              className="btn btn--primary"
              disabled={chBusy || !ch.slug || !ch.display_name || !ch.adapter_key}
              onClick={createChannel}
            >
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
        <Field label="协议 Adapter" hint="该渠道只会被兼容此 Adapter 的模型使用">
          <Select
            value={ch.adapter_key}
            options={provider.adapter_keys.map((key) => ({ value: key, label: key }))}
            onChange={(v) => setCh({ ...ch, adapter_key: v })}
          />
        </Field>
      </Modal>

      {/* 新增凭证 */}
      {canManageCredentials ? <Modal
        open={credFor !== null} onClose={() => setCredFor(null)} title="新增凭证" width={560}
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setCredFor(null)}>取消</button>
            <button
              className="btn btn--primary"
              disabled={credBusy || !credApiKey.trim()}
              onClick={createCred}
            >
              {credBusy ? '处理中…' : '创建'}
            </button>
          </>
        }
      >
        <Field label="标签" hint="可选"><TextInput value={credLabel} onChange={(e) => setCredLabel(e.target.value)} /></Field>
        <Field label="API Key">
          <TextInput
            type="password"
            value={credApiKey}
            onChange={(event) => setCredApiKey(event.target.value)}
            autoComplete="new-password"
          />
        </Field>
      </Modal> : null}
    </SettingsPage>
  );
}
