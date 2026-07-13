/* 计费 — real per-request cost over the request-log ledger. Cost is frozen at request
 * time from each model's native-meter rate (tokens / seconds / images), summed per
 * currency (no cross-currency conversion). A Segmented switches the breakdown dimension. */
import { useEffect, useState } from 'react';
import { SettingsPage, DataTable, StatCard, Loading, ErrorNote } from '../components/kit';
import type { Column } from '../components/kit';
import { Segmented } from '../../ui';
import { billingApi } from '../api';
import type { BillingOverview, BillingRow } from '../types';

type Tab = 'overview' | 'model' | 'member' | 'project';

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: '概览' },
  { value: 'model', label: '按模型' },
  { value: 'member', label: '按成员' },
  { value: 'project', label: '按项目' },
];

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
/** Tiny costs (fractions of a cent) need precision; larger ones read better short. */
const fmtCost = (currency: string | null, cost: number) => {
  const c = currency ?? '—';
  return cost > 0 && cost < 0.01 ? `${c} ${cost.toFixed(6)}` : `${c} ${cost.toFixed(4)}`;
};

function OverviewView() {
  const [data, setData] = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    billingApi
      .overview()
      .then((d) => alive && setData(d))
      .catch((e: unknown) => alive && setError('加载概览失败: ' + errMsg(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} />;
  if (!data) return <ErrorNote message="暂无计费数据" />;

  return (
    <>
      <div className="set-stats">
        <StatCard label="总请求数" value={data.requests} />
        <StatCard label="成功" value={data.success} />
        <StatCard label="失败" value={data.error} />
        <StatCard label="输入 tokens" value={data.input_tokens} />
        <StatCard label="输出 tokens" value={data.output_tokens} />
      </div>
      <div className="set-section-title">费用(按币种)</div>
      {data.by_currency.length === 0 ? (
        <div className="set-stat__sub">暂无已计费请求(历史请求或无费率模型不计费)</div>
      ) : (
        <div className="set-stats">
          {data.by_currency.map((c) => (
            <StatCard key={c.currency} label={c.currency} value={fmtCost(c.currency, c.cost)} />
          ))}
        </div>
      )}
    </>
  );
}

function DimView({ load, keyLabel }: { load: () => Promise<BillingRow[]>; keyLabel: string }) {
  const [rows, setRows] = useState<BillingRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    load()
      .then((d) => alive && setRows(d))
      .catch((e: unknown) => alive && setError(errMsg(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <ErrorNote message={error} />;
  if (rows === null) return <Loading />;

  const cols: Column<BillingRow>[] = [
    { key: 'label', header: keyLabel, render: (r) => r.label ?? r.key ?? '(未知)' },
    { key: 'requests', header: '请求数', width: 100, render: (r) => r.requests },
    { key: 'tokens', header: 'tokens(入/出)', width: 160, render: (r) => `${r.input_tokens} / ${r.output_tokens}` },
    { key: 'cost', header: '费用', width: 160, render: (r) => fmtCost(r.currency, r.cost) },
  ];
  return (
    <DataTable
      columns={cols}
      rows={rows}
      rowKey={(r) => `${r.key ?? 'na'}-${r.currency ?? 'na'}`}
      empty="暂无计费记录"
    />
  );
}

export default function Billing() {
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <SettingsPage title="计费">
      <div style={{ marginBottom: 16 }}>
        <Segmented<Tab> value={tab} options={TABS} onChange={setTab} />
      </div>
      {tab === 'overview' ? <OverviewView /> : null}
      {tab === 'model' ? <DimView load={billingApi.byModel} keyLabel="模型" /> : null}
      {tab === 'member' ? <DimView load={billingApi.byMember} keyLabel="成员" /> : null}
      {tab === 'project' ? <DimView load={billingApi.byProject} keyLabel="项目" /> : null}
    </SettingsPage>
  );
}
