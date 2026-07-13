/* Usage stats — merged ConsumptionOverview / ByModel / ByMember / ByProject.
 * One page; a Segmented switches the active view. Each tab loads its own data
 * and tolerates a failing endpoint without crashing the page. */
import { useEffect, useState } from 'react';
import { SettingsPage, DataTable, StatCard, Badge, Loading, ErrorNote } from '../components/kit';
import type { Column } from '../components/kit';
import { Segmented } from '../../ui';
import { statsApi } from '../api';
import type { StatsOverview, ModelStats, MemberStats, ProjectStats } from '../types';

type Tab = 'overview' | 'model' | 'member' | 'project';

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: '概览' },
  { value: 'model', label: '按模型' },
  { value: 'member', label: '按成员' },
  { value: 'project', label: '按项目' },
];

const STATUS: { key: keyof StatsOverview; label: string; tone: 'success' | 'danger' | 'warning' | 'info' | 'default' }[] = [
  { key: 'succeeded', label: '成功', tone: 'success' },
  { key: 'failed', label: '失败', tone: 'danger' },
  { key: 'cancelled', label: '已取消', tone: 'warning' },
  { key: 'running', label: '运行中', tone: 'info' },
  { key: 'queued', label: '排队中', tone: 'default' },
];

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
const money = (n: number) => `¥${n.toFixed(2)}`;
const rate = (n: number) => `${n.toFixed(0)}%`;

/* ── overview tab ────────────────────────────────────────────── */
function OverviewView() {
  const [data, setData] = useState<StatsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    statsApi
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
  if (!data) return <ErrorNote message="暂无概览数据" />;

  return (
    <>
      <div className="set-stats">
        <StatCard label="总任务数" value={data.total} />
        <StatCard label="预估费用" value={money(data.estimated_cost)} />
      </div>
      <div className="set-tags" style={{ marginTop: 16 }}>
        {STATUS.map((s) => (
          <Badge key={s.key} tone={s.tone}>
            {s.label} {data[s.key]}
          </Badge>
        ))}
      </div>
    </>
  );
}

/* ── model tab ───────────────────────────────────────────────── */
const MODEL_COLUMNS: Column<ModelStats>[] = [
  { key: 'model_id', header: '模型' },
  { key: 'total', header: '任务数', width: 100 },
  { key: 'succeeded', header: '成功', width: 100 },
  { key: 'success_rate', header: '成功率', width: 120, render: (r) => rate(r.success_rate) },
];

const MEMBER_COLUMNS: Column<MemberStats>[] = [
  { key: 'name', header: '成员', render: (r) => r.display_name || r.email || r.owner_id.slice(0, 8) },
  { key: 'total', header: '任务数', width: 100 },
  { key: 'succeeded', header: '成功', width: 100 },
  { key: 'estimated_cost', header: '预估费用', width: 140, render: (r) => money(r.estimated_cost) },
];

const PROJECT_COLUMNS: Column<ProjectStats>[] = [
  { key: 'name', header: '项目', render: (r) => r.project_name || '(未归类)' },
  { key: 'total', header: '任务数', width: 100 },
  { key: 'succeeded', header: '成功', width: 100 },
  { key: 'estimated_cost', header: '预估费用', width: 140, render: (r) => money(r.estimated_cost) },
];

function RowsView<T>({
  load,
  columns,
  rowKey,
  errLabel,
}: {
  load: () => Promise<T[]>;
  columns: Column<T>[];
  rowKey: (r: T) => string;
  errLabel: string;
}) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    load()
      .then((d) => alive && setRows(d))
      .catch((e: unknown) => alive && setError(errLabel + ': ' + errMsg(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} />;
  return <DataTable columns={columns} rows={rows} rowKey={rowKey} empty="暂无数据" />;
}

export default function Usage() {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <SettingsPage title="用量统计" description="任务消耗概览与按模型 / 成员 / 项目的明细统计">
      <div>
        <Segmented value={tab} options={TABS} onChange={setTab} />
      </div>
      {tab === 'overview' && <OverviewView key="overview" />}
      {tab === 'model' && (
        <RowsView key="model" load={statsApi.byModel} columns={MODEL_COLUMNS} rowKey={(r) => r.model_id} errLabel="加载模型用量失败" />
      )}
      {tab === 'member' && (
        <RowsView key="member" load={statsApi.byMember} columns={MEMBER_COLUMNS} rowKey={(r) => r.owner_id} errLabel="加载成员消耗失败" />
      )}
      {tab === 'project' && (
        <RowsView
          key="project"
          load={statsApi.byProject}
          columns={PROJECT_COLUMNS}
          rowKey={(r) => r.project_id ?? 'none'}
          errLabel="加载项目消耗失败"
        />
      )}
    </SettingsPage>
  );
}
