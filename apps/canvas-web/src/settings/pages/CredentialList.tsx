/* 凭证 — aggregate all credentials across providers > channels > credentials.
 * There is no list-all endpoint, so we fan out: providerApi.list() ->
 * channelApi.listByProvider() -> credentialApi.listByChannel(), flatten rows. */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SettingsPage, DataTable, BoolBadge, Badge, Loading, ErrorNote } from '../components/kit';
import type { Column } from '../components/kit';
import { toast } from '../../ui';
import { providerApi, channelApi, credentialApi } from '../api';
import type { CredentialView, ProviderStatusView } from '../types';
import { AddCredentialWizard } from './AddCredentialWizard';
import type { Modality } from './wizard/modality';

interface CredRow {
  credential: CredentialView;
  providerName: string;
  channelName: string;
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : '请求失败';
}

function parseModality(raw: string | null): Modality | null {
  if (raw === 'text' || raw === 'image' || raw === 'video' || raw === 'audio') return raw;
  return null;
}

const CredentialList: React.FC = () => {
  const [rows, setRows] = useState<CredRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [balances, setBalances] = useState<Record<string, ProviderStatusView | undefined>>({});
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardModality, setWizardModality] = useState<Modality | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setWizardModality(parseModality(searchParams.get('modality')));
      setWizardOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const providers = await providerApi.list();
      // fan out per provider -> channels, then per channel -> credentials
      const perProvider = await Promise.all(
        providers.map(async (p) => {
          let channels;
          try {
            channels = await channelApi.listByProvider(p.id);
          } catch {
            return [] as CredRow[];
          }
          const perChannel = await Promise.all(
            channels.map(async (ch) => {
              try {
                const creds = await credentialApi.listByChannel(ch.id);
                return creds.map<CredRow>((c) => ({
                  credential: c,
                  providerName: p.display_name,
                  channelName: ch.display_name,
                }));
              } catch {
                return [] as CredRow[];
              }
            }),
          );
          return perChannel.flat();
        }),
      );
      const flat = perProvider.flat();
      setRows(flat);
      // Lazily fetch each credential's balance (best-effort — a balance belongs to a key).
      flat.forEach((r) =>
        credentialApi
          .balance(r.credential.id)
          .then((b) => setBalances((prev) => ({ ...prev, [r.credential.id]: b })))
          .catch(() => undefined),
      );
    } catch (e: unknown) {
      setError(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleValidate = useCallback(
    async (row: CredRow) => {
      const id = row.credential.id;
      setBusyId(id);
      try {
        const view = await credentialApi.validate(id);
        if (view.is_valid) toast.success('有效');
        else toast.warning(`无效${view.validation_error ? `: ${view.validation_error}` : ''}`);
        await load();
      } catch (e: unknown) {
        toast.error(errMessage(e));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const handleDelete = useCallback(
    async (row: CredRow) => {
      if (!window.confirm('确认删除该凭证？')) return;
      const id = row.credential.id;
      setBusyId(id);
      try {
        await credentialApi.remove(id);
        toast.success('已删除');
        await load();
      } catch (e: unknown) {
        toast.error(errMessage(e));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const columns: Column<CredRow>[] = [
    {
      key: 'credential',
      header: '凭证',
      render: (r) => r.credential.label || r.credential.credential_type,
    },
    {
      key: 'type',
      header: '类型',
      render: (r) => <Badge tone="info">{r.credential.credential_type}</Badge>,
    },
    { key: 'channel', header: '渠道', render: (r) => r.channelName },
    { key: 'provider', header: '供应商', render: (r) => r.providerName },
    {
      key: 'valid',
      header: '有效',
      render: (r) => <BoolBadge value={r.credential.is_valid} on="有效" off="失效" />,
    },
    {
      key: 'balance',
      header: '余额',
      width: 160,
      render: (r) => {
        const b = balances[r.credential.id];
        if (!b) return <span className="set-stat__sub">查询中…</span>;
        if (b.items.length === 0) return <span className="set-stat__sub">{b.note ?? '—'}</span>;
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {b.items.map((it, i) => (
              <Badge key={i} tone={it.tone ?? 'default'}>
                {it.label} {it.value}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: '操作',
      width: 160,
      render: (r) => {
        const busy = busyId === r.credential.id;
        return (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              disabled={busy}
              onClick={() => void handleValidate(r)}
            >
              {busy ? '处理中…' : '校验'}
            </button>
            <button
              type="button"
              className="btn btn--danger btn--sm"
              disabled={busy}
              onClick={() => void handleDelete(r)}
            >
              {busy ? '处理中…' : '删除'}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <SettingsPage
      title="凭证"
      description="一个凭证 = 一个 key/账号。从这里接入供应商、获取并启用模型、查看余额。"
      actions={
        <button type="button" className="btn btn--primary" onClick={() => setWizardOpen(true)}>
          添加凭证
        </button>
      }
    >
      {loading ? (
        <Loading label="聚合凭证中…" />
      ) : error ? (
        <ErrorNote message={error} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.credential.id}
          empty="暂无凭证，点右上角「添加凭证」接入"
        />
      )}

      <AddCredentialWizard
        open={wizardOpen}
        initialModality={wizardModality}
        onClose={() => {
          setWizardOpen(false);
          setWizardModality(null);
        }}
        onSaved={() => void load()}
      />
    </SettingsPage>
  );
};

export default CredentialList;
