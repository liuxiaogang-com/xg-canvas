/* /settings landing — system config + usage overview. */
import { useEffect, useState } from 'react';
import { SettingsPage, StatCard, Badge, Loading, ErrorNote } from '../components/kit';
import { statsApi, providerApi, modelApi } from '../api';
import type { StatsOverview } from '../types';
import { useCan } from '../../store/permissions';
import { loadSettingsOverview, type SettingsOverviewData } from '../overview-data';

const STATUS_META: { key: keyof StatsOverview; label: string; tone: 'success' | 'danger' | 'warning' | 'info' | 'default' }[] = [
  { key: 'succeeded', label: '成功', tone: 'success' },
  { key: 'failed', label: '失败', tone: 'danger' },
  { key: 'cancelled', label: '已取消', tone: 'warning' },
  { key: 'running', label: '运行中', tone: 'info' },
  { key: 'queued', label: '排队中', tone: 'default' },
];

export default function Overview() {
  const can = useCan();
  const canManageModels = can('system.model.manage');
  const canViewBilling = can('system.billing.view');
  const [data, setData] = useState<SettingsOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const next = await loadSettingsOverview({ canManageModels, canViewBilling }, {
          stats: statsApi.overview,
          providers: providerApi.list,
          models: () => modelApi.list(),
        });
        if (!alive) return;
        setData(next);
      } catch (e: unknown) {
        if (alive) setError(e instanceof Error ? e.message : '加载概览失败');
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [canManageModels, canViewBilling]);

  const ov = data?.stats;

  return (
    <SettingsPage title="概览" description="系统配置与任务用量总览；真实费用请在计费页按原生币种查看。">
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNote message={error} />
      ) : data ? (
        <>
          <div className="set-stats">
            <StatCard
              label="总任务数"
              value={ov?.total ?? '无权限'}
              sub={ov ? '当前 Workspace' : '需要计费查看权限'}
            />
            <StatCard
              label="供应商数"
              value={data.providerCount ?? '无权限'}
              sub={data.providerCount === null ? '需要供应商/模型管理权限' : undefined}
            />
            <StatCard
              label="模型数"
              value={data.modelCount ?? '无权限'}
              sub={data.modelCount === null ? '需要供应商/模型管理权限' : undefined}
            />
          </div>

          {ov ? <div className="set-section-title" style={{ marginTop: 8 }}>按状态</div> : null}
          {ov && ov.total === 0 ? (
            <div className="empty">暂无任务数据</div>
          ) : ov ? (
            <div className="set-tags">
              {STATUS_META.map((m) => (
                <Badge key={m.key} tone={m.tone}>
                  {m.label} {ov[m.key]}
                </Badge>
              ))}
            </div>
          ) : null}
        </>
      ) : <ErrorNote message="加载概览失败" />}
    </SettingsPage>
  );
}
