/* /settings landing — system config + usage overview. */
import { useEffect, useState } from 'react';
import { SettingsPage, StatCard, Badge, Loading, ErrorNote } from '../components/kit';
import { statsApi, providerApi, modelApi } from '../api';
import type { StatsOverview } from '../types';

const ZERO: StatsOverview = {
  total: 0,
  succeeded: 0,
  failed: 0,
  cancelled: 0,
  running: 0,
  queued: 0,
  estimated_cost: 0,
};

const STATUS_META: { key: keyof StatsOverview; label: string; tone: 'success' | 'danger' | 'warning' | 'info' | 'default' }[] = [
  { key: 'succeeded', label: '成功', tone: 'success' },
  { key: 'failed', label: '失败', tone: 'danger' },
  { key: 'cancelled', label: '已取消', tone: 'warning' },
  { key: 'running', label: '运行中', tone: 'info' },
  { key: 'queued', label: '排队中', tone: 'default' },
];

export default function Overview() {
  const [ov, setOv] = useState<StatsOverview>(ZERO);
  const [providerCount, setProviderCount] = useState(0);
  const [modelCount, setModelCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [stats, providers, models] = await Promise.all([
          statsApi.overview().catch(() => ZERO),
          providerApi.list(),
          modelApi.list(),
        ]);
        if (!alive) return;
        setOv(stats);
        setProviderCount(providers.length);
        setModelCount(models.length);
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
  }, []);

  return (
    <SettingsPage title="概览" description="系统配置与用量总览">
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNote message={error} />
      ) : (
        <>
          <div className="set-stats">
            <StatCard label="总任务数" value={ov.total} />
            <StatCard label="预估消耗" value={`¥${ov.estimated_cost.toFixed(2)}`} />
            <StatCard label="供应商数" value={providerCount} />
            <StatCard label="模型数" value={modelCount} />
          </div>

          <div className="set-section-title" style={{ marginTop: 8 }}>
            按状态
          </div>
          {ov.total === 0 ? (
            <div className="empty">暂无任务数据</div>
          ) : (
            <div className="set-tags">
              {STATUS_META.map((m) => (
                <Badge key={m.key} tone={m.tone}>
                  {m.label} {ov[m.key]}
                </Badge>
              ))}
            </div>
          )}
        </>
      )}
    </SettingsPage>
  );
}
