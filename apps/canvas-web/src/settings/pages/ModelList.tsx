/* Model list — ported from account-admin/src/pages/ModelList.tsx into the dark
 * settings surface. Lists model definitions with task-type + provider filters;
 * row click opens the detail editor. */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SettingsPage, DataTable, BoolBadge, Badge, Loading, ErrorNote } from '../components/kit';
import type { Column } from '../components/kit';
import { Select } from '../../ui';
import { modelApi, providerApi } from '../api';
import type { ModelDefinition, Provider } from '../types';

/* task type -> badge tone, mirroring the original AntD colour map */
const TASK_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'default'> = {
  text2image: 'accent',
  image2image: 'danger',
  image_upscale: 'warning',
  text2video: 'warning',
  image2video: 'warning',
  frames2video: 'success',
  multimodal2video: 'success',
  chat: 'info',
  completion: 'info',
};

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function ModelList() {
  const navigate = useNavigate();
  const [models, setModels] = useState<ModelDefinition[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | undefined>();
  const [filterProvider, setFilterProvider] = useState<string | undefined>();
  // Default to only enabled (i.e. actually configured/usable) models; the toggle
  // reveals disabled ones for maintenance.
  const [showDisabled, setShowDisabled] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [m, p] = await Promise.all([modelApi.list(), providerApi.list()]);
        if (!alive) return;
        setModels(m);
        setProviders(p);
      } catch (e: unknown) {
        if (alive) setError(errMessage(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const providerMap = useMemo(
    () => Object.fromEntries(providers.map((p) => [p.id, p.display_name])),
    [providers],
  );

  const allTaskTypes = useMemo(
    () => [...new Set(models.flatMap((m) => m.task_types ?? []))],
    [models],
  );

  const rows = useMemo(() => {
    let out = models;
    if (!showDisabled) out = out.filter((m) => m.enabled);
    if (filterType) out = out.filter((m) => m.task_types?.includes(filterType));
    if (filterProvider) out = out.filter((m) => m.provider_id === filterProvider);
    return out;
  }, [models, showDisabled, filterType, filterProvider]);

  const columns: Column<ModelDefinition>[] = [
    {
      key: 'model',
      header: '模型',
      render: (r) => (
        <div>
          <div className="set-cell__title">{r.display_name}</div>
          <div className="set-cell__sub">{r.model_id}</div>
        </div>
      ),
    },
    {
      key: 'provider',
      header: '提供商',
      render: (r) => providerMap[r.provider_id] ?? r.provider_id,
    },
    {
      key: 'task_types',
      header: '任务类型',
      render: (r) => (
        <div className="set-tags">
          {(r.task_types ?? []).map((t) => (
            <Badge key={t} tone={TASK_TONE[t] ?? 'default'}>
              {t}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'invocation_mode',
      header: '调用',
      render: (r) => <Badge tone="info">{r.invocation_mode}</Badge>,
    },
    {
      key: 'enabled',
      header: '状态',
      render: (r) => <BoolBadge value={r.enabled} />,
    },
    {
      key: 'deprecated',
      header: '弃用',
      render: (r) => (r.deprecated ? <Badge tone="danger">已弃用</Badge> : null),
    },
  ];

  const filters = (
    <div className="set-filters">
      <Select<string>
        value={filterType}
        placeholder="筛选任务类型"
        options={[
          { value: '', label: '全部任务类型' },
          ...allTaskTypes.map((t) => ({ value: t, label: t })),
        ]}
        onChange={(v) => setFilterType(v || undefined)}
      />
      <Select<string>
        value={filterProvider}
        placeholder="筛选提供商"
        options={[
          { value: '', label: '全部提供商' },
          ...providers.map((p) => ({ value: p.id, label: p.display_name })),
        ]}
        onChange={(v) => setFilterProvider(v || undefined)}
      />
      <label className="set-filter-check">
        <input
          type="checkbox"
          checked={showDisabled}
          onChange={(e) => setShowDisabled(e.target.checked)}
        />
        显示未启用
      </label>
    </div>
  );

  return (
    <SettingsPage title="模型" description="默认仅显示已启用（已配置可用）的模型；运营字段可在详情页调整。" actions={filters}>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNote message={error} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/settings/models/${r.id}`)}
          empty="暂无模型"
        />
      )}
    </SettingsPage>
  );
}
