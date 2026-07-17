/* Model list — ported from account-admin/src/pages/ModelList.tsx into the dark
 * settings surface. Lists model definitions with task-type + provider filters;
 * row click opens the detail editor. */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TaskType } from '@xgcanvas/shared-types';
import { SettingsPage, DataTable, BoolBadge, Badge, Loading, ErrorNote } from '../components/kit';
import type { Column } from '../components/kit';
import { Select } from '../../ui';
import { modelApi, providerApi } from '../api';
import type { ModelDefinition, Provider } from '../types';
import { CatalogOriginBadge } from '../components/CatalogOriginBadge';
import CreateLocalModelModal from './CreateLocalModelModal';

/* task type -> badge tone, mirroring the original AntD colour map */
const TASK_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'default'> = {
  'gen.text': 'info',
  'gen.image': 'accent',
  'gen.video': 'warning',
  'gen.audio': 'success',
  'audio.transcribe': 'info',
  'image.edit': 'danger',
  'image.upscale': 'warning',
  'video.upscale': 'warning',
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
  const [filterType, setFilterType] = useState<TaskType | undefined>();
  const [filterProvider, setFilterProvider] = useState<string | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  // Default to models enabled by Runtime Settings. Availability additionally
  // depends on Provider/Channel/Credential and is enforced by the public list.
  const [showDisabled, setShowDisabled] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [m, p] = await Promise.all([modelApi.list(true), providerApi.list()]);
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
    () => Object.fromEntries(providers.map((p) => [p.resource_uid, p.display_name])),
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
    if (filterProvider) out = out.filter((m) => m.provider_resource_uid === filterProvider);
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
      render: (r) => providerMap[r.provider_resource_uid] ?? r.provider_resource_uid,
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
      key: 'origin',
      header: '来源',
      render: (r) => <CatalogOriginBadge origin={r.origin} />,
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
      <Select<TaskType | ''>
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
          ...providers.map((p) => ({ value: p.resource_uid, label: p.display_name })),
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

  const actions = (
    <>
      <button type="button" className="btn btn--primary" onClick={() => setCreateOpen(true)}>
        新建本地模型
      </button>
      {filters}
    </>
  );

  return (
    <SettingsPage title="模型" description="默认仅显示 Runtime Settings 已启用的模型；实际可用性还取决于供应商、渠道与凭证。" actions={actions}>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNote message={error} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.resource_uid}
          onRowClick={(r) => navigate(`/settings/models/${r.resource_uid}`)}
          empty="暂无模型"
        />
      )}
      <CreateLocalModelModal
        open={createOpen}
        providers={providers}
        onClose={() => setCreateOpen(false)}
      />
    </SettingsPage>
  );
}
