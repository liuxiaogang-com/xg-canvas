/* Feature model config — each feature owns one ordered Model Resource chain.
 * Index 0 is preferred; later entries are tried in order when unavailable. */
import { useEffect, useMemo, useState } from 'react';

import { Drawer } from '../../ui';
import { featureConfigApi } from '../api';
import { Badge, BoolBadge, DataTable, ErrorNote, Field, Loading, SettingsPage } from '../components/kit';
import type { Column } from '../components/kit';
import type { FeatureConfig, FeatureConfigModelOption } from '../types';
import {
  incompatibleFeatureModelUids,
  supportsFeatureTaskType,
} from '../feature-model-compatibility';
import { moveResourceUid, toggleResourceUid } from '../feature-model-order';

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function FeatureConfigPage() {
  const [features, setFeatures] = useState<FeatureConfig[]>([]);
  const [models, setModels] = useState<FeatureConfigModelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FeatureConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [orderedResourceUids, setOrderedResourceUids] = useState<string[]>([]);
  const [formEnabled, setFormEnabled] = useState(true);

  useEffect(() => {
    let alive = true;
    void Promise.all([featureConfigApi.list(), featureConfigApi.modelOptions()])
      .then(([nextFeatures, nextModels]) => {
        if (!alive) return;
        setFeatures(nextFeatures);
        setModels(nextModels);
      })
      .catch((reason: unknown) => {
        if (alive) setError(errMsg(reason));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const modelByResourceUid = useMemo(
    () => new Map(models.map((model) => [model.resource_uid, model])),
    [models],
  );
  const compatibleModels = useMemo(
    () => editing
      ? models.filter((model) => supportsFeatureTaskType(model, editing.required_task_type))
      : [],
    [editing, models],
  );
  const addableCompatibleModels = useMemo(
    () => compatibleModels.filter(
      (model) => !orderedResourceUids.includes(model.resource_uid),
    ),
    [compatibleModels, orderedResourceUids],
  );
  const incompatibleSelectedUids = useMemo(
    () => editing
      ? incompatibleFeatureModelUids(
          orderedResourceUids,
          models,
          editing.required_task_type,
        )
      : [],
    [editing, models, orderedResourceUids],
  );

  const openEdit = (feature: FeatureConfig) => {
    setEditing(feature);
    setOrderedResourceUids([...feature.model_resource_uids]);
    setFormEnabled(feature.enabled);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await featureConfigApi.upsert(editing.feature_key, {
        feature_key: editing.feature_key,
        display_name: editing.display_name,
        description: editing.description ?? undefined,
        model_resource_uids: orderedResourceUids,
        enabled: formEnabled,
      });
      setFeatures((current) => current.map((feature) => (
        feature.feature_key === editing.feature_key ? updated : feature
      )));
      setEditing(null);
    } catch (reason: unknown) {
      setError(errMsg(reason));
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<FeatureConfig>[] = [
    {
      key: 'feature',
      header: '功能',
      render: (feature) => (
        <div>
          <div className="set-cell__title">{feature.display_name}</div>
          <div className="set-cell__sub">{feature.feature_key}</div>
          <Badge tone="info">要求 {feature.required_task_type}</Badge>
          {feature.description ? <div className="set-cell__desc">{feature.description}</div> : null}
        </div>
      ),
    },
    {
      key: 'enabled',
      header: '状态',
      width: 80,
      render: (feature) => <BoolBadge value={feature.enabled} />,
    },
    {
      key: 'models',
      header: '有序模型链路',
      render: (feature) => (
        <div className="set-tags">
          {feature.model_resource_uids.length === 0 ? (
            <span className="set-cell__muted">未配置</span>
          ) : feature.model_resource_uids.map((resourceUid, index) => {
            const model = modelByResourceUid.get(resourceUid);
            return (
              <Badge key={resourceUid} tone={index === 0 ? 'accent' : 'default'}>
                {index + 1}. {model?.display_name ?? resourceUid}
              </Badge>
            );
          })}
        </div>
      ),
    },
  ];

  return (
    <SettingsPage
      title="功能配置"
      description="按顺序绑定模型资源：第一个是首选，后续模型按顺序回退。"
    >
      {loading ? <Loading /> : error && features.length === 0 ? (
        <ErrorNote message={error} />
      ) : (
        <>
          {error ? <ErrorNote message={error} /> : null}
          <DataTable
            columns={columns}
            rows={features}
            rowKey={(feature) => feature.feature_key}
            onRowClick={openEdit}
            empty="暂无功能配置"
          />
        </>
      )}

      <Drawer
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `编辑：${editing.display_name}` : undefined}
        side="right"
        width={520}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setEditing(null)} disabled={saving}>取消</button>
            <button
              className="btn btn--primary"
              onClick={saveEdit}
              disabled={saving || incompatibleSelectedUids.length > 0}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        }
      >
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="set-cell__desc">
              此功能固定要求 <Badge tone="info">{editing.required_task_type}</Badge>；
              只能绑定当前 Model Catalog Revision 声明支持该任务类型的模型。
            </div>

            {incompatibleSelectedUids.length > 0 ? (
              <ErrorNote
                message={`已有 ${incompatibleSelectedUids.length} 个绑定不再兼容 ${editing.required_task_type}，请先移除后再保存。`}
              />
            ) : null}

            <Field label="启用">
              <label className="set-filter-check">
                <input
                  type="checkbox"
                  checked={formEnabled}
                  onChange={(event) => setFormEnabled(event.target.checked)}
                />
                {formEnabled ? '已启用' : '已停用'}
              </label>
            </Field>

            <Field label="模型优先级" hint="拖动替代方案暂未开放；使用上下按钮调整精确顺序。">
              <div className="set-model-pool">
                {orderedResourceUids.length === 0 ? (
                  <p className="set-cell__muted">尚未选择模型</p>
                ) : orderedResourceUids.map((resourceUid, index) => {
                  const model = modelByResourceUid.get(resourceUid);
                  return (
                    <div key={resourceUid} className="set-filter-check" style={{ gap: 8 }}>
                      <Badge tone={index === 0 ? 'accent' : 'default'}>{index + 1}</Badge>
                      <span style={{ flex: 1 }}>
                        {model ? `${model.provider.display_name} / ${model.display_name}` : resourceUid}
                      </span>
                      {!model || !supportsFeatureTaskType(model, editing.required_task_type) ? (
                        <Badge tone="danger">不兼容 {editing.required_task_type}</Badge>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={index === 0}
                        onClick={() => setOrderedResourceUids((current) => moveResourceUid(current, resourceUid, -1))}
                        aria-label="上移"
                      >↑</button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={index === orderedResourceUids.length - 1}
                        onClick={() => setOrderedResourceUids((current) => moveResourceUid(current, resourceUid, 1))}
                        aria-label="下移"
                      >↓</button>
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        onClick={() => setOrderedResourceUids((current) => toggleResourceUid(current, resourceUid))}
                      >移除</button>
                    </div>
                  );
                })}
              </div>
            </Field>

            <Field
              label="添加模型"
              hint={`仅显示支持 ${editing.required_task_type} 的模型；绑定使用稳定 model_resource_uid。`}
            >
              <div className="set-model-pool">
                {addableCompatibleModels.length === 0 ? (
                  <p className="set-cell__muted">
                    没有更多支持 {editing.required_task_type} 的模型
                  </p>
                ) : addableCompatibleModels.map((model) => (
                    <label key={model.resource_uid} className="set-filter-check">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => setOrderedResourceUids((current) => toggleResourceUid(current, model.resource_uid))}
                      />
                      <span>
                        {model.provider.display_name} / {model.display_name}
                        <span className="set-cell__sub"> {model.model_id}</span>
                      </span>
                      {!model.enabled ? <Badge tone="warning">未启用</Badge> : null}
                    </label>
                  ))}
              </div>
            </Field>
          </div>
        ) : null}
      </Drawer>
    </SettingsPage>
  );
}
