/* Feature model config — maps feature scenarios (AI analysis, agent, etc.)
 * to specific model pools with primary/fallback resolution.
 * Editing opens in a right-side Drawer (buerguo nav-004 / ui-041). */
import { useEffect, useMemo, useState } from 'react';
import { SettingsPage, DataTable, BoolBadge, Badge, Loading, ErrorNote, Field } from '../components/kit';
import type { Column } from '../components/kit';
import { Select, Drawer } from '../../ui';
import { featureConfigApi } from '../api';
import type { FeatureConfig } from '../types';
import { modelApi } from '../../api/model';
import type { RichModelSummary } from '../../api/model';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function FeatureConfigPage() {
  const [features, setFeatures] = useState<FeatureConfig[]>([]);
  const [models, setModels] = useState<RichModelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FeatureConfig | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [formModelIds, setFormModelIds] = useState<string[]>([]);
  const [formPrimary, setFormPrimary] = useState<string | null>(null);
  const [formFallback, setFormFallback] = useState<string | null>(null);
  const [formEnabled, setFormEnabled] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [f, m] = await Promise.all([
          featureConfigApi.list(),
          modelApi.list(),
        ]);
        if (!alive) return;
        setFeatures(f);
        // Only show text models — AI analysis, agent, etc. all need gen.text.
        // Future features with other task types can make this per-feature-key.
        setModels(m.filter((x) => x.task_types?.includes('gen.text')));
      } catch (e: unknown) {
        if (alive) setError(errMsg(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const openEdit = (f: FeatureConfig) => {
    setEditing(f);
    setFormModelIds([...f.model_ids]);
    setFormPrimary(f.primary_model_id);
    setFormFallback(f.fallback_model_id);
    setFormEnabled(f.enabled);
  };

  const closeEdit = () => {
    setEditing(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const updated = await featureConfigApi.upsert(editing.feature_key, {
        feature_key: editing.feature_key,
        display_name: editing.display_name,
        model_ids: formModelIds,
        primary_model_id: formPrimary || null,
        fallback_model_id: formFallback || null,
        enabled: formEnabled,
      });
      setFeatures((prev) =>
        prev.map((f) => (f.feature_key === editing.feature_key ? updated : f)),
      );
      closeEdit();
    } catch (e: unknown) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleModel = (modelId: string) => {
    setFormModelIds((prev) => {
      const next = prev.includes(modelId) ? prev.filter((m) => m !== modelId) : [...prev, modelId];
      const nextSet = new Set(next);
      setFormPrimary((p) => (p && !nextSet.has(p) ? null : p));
      setFormFallback((f) => (f && !nextSet.has(f) ? null : f));
      return next;
    });
  };

  const modelOptions = useMemo(
    () =>
      models.map((m) => ({
        value: m.id,
        label: `${m.provider.display_name} / ${m.display_name}`,
      })),
    [models],
  );

  const poolOptions = useMemo(
    () => [
      { value: '', label: '（无）' },
      ...formModelIds.map((mid) => {
        const m = models.find((x) => x.id === mid);
        return {
          value: mid,
          label: m ? `${m.provider.display_name} / ${m.display_name}` : mid,
        };
      }),
    ],
    [formModelIds, models],
  );

  const columns: Column<FeatureConfig>[] = [
    {
      key: 'feature',
      header: '功能',
      render: (r) => (
        <div>
          <div className="set-cell__title">{r.display_name}</div>
          <div className="set-cell__sub">{r.feature_key}</div>
          {r.description ? (
            <div className="set-cell__desc">{r.description}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'enabled',
      header: '状态',
      width: 80,
      render: (r) => <BoolBadge value={r.enabled} />,
    },
    {
      key: 'primary',
      header: '首选模型',
      render: (r) => {
        const m = models.find((x) => x.id === r.primary_model_id);
        return m ? (
          <span>
            {m.provider.display_name} / {m.display_name}
          </span>
        ) : (
          <span className="set-cell__muted">{r.primary_model_id ?? '—'}</span>
        );
      },
    },
    {
      key: 'fallback',
      header: '回退模型',
      render: (r) => {
        const m = models.find((x) => x.id === r.fallback_model_id);
        return m ? (
          <span>
            {m.provider.display_name} / {m.display_name}
          </span>
        ) : (
          <span className="set-cell__muted">{r.fallback_model_id ?? '—'}</span>
        );
      },
    },
    {
      key: 'pool',
      header: '候选池',
      render: (r) => (
        <div className="set-tags">
          {r.model_ids.length === 0 ? (
            <span className="set-cell__muted">空</span>
          ) : (
            r.model_ids.map((mid) => {
              const m = models.find((x) => x.id === mid);
              return (
                <Badge key={mid} tone="default">
                  {m ? m.display_name : mid}
                </Badge>
              );
            })
          )}
        </div>
      ),
    },
  ];

  return (
    <SettingsPage
      title="功能配置"
      description="为各功能场景（AI 分析、Agent 等）指定可用模型池及首选/回退链路。只显示已配置凭证的模型。"
    >
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNote message={error} />
      ) : (
        <DataTable
          columns={columns}
          rows={features}
          rowKey={(r) => r.feature_key}
          onRowClick={(r) => openEdit(r)}
          empty="暂无功能配置"
        />
      )}

      <Drawer
        open={!!editing}
        onClose={closeEdit}
        title={editing ? `编辑：${editing.display_name}` : undefined}
        side="right"
        width={480}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn--primary" onClick={saveEdit} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
            <button className="btn" onClick={closeEdit} disabled={saving}>
              取消
            </button>
          </div>
        }
      >
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="启用">
              <label className="set-filter-check">
                <input
                  type="checkbox"
                  checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                />
                {formEnabled ? '已启用' : '已停用'}
              </label>
            </Field>

            <Field label="候选模型池" hint="勾选该功能可用的模型（仅显示有凭证的模型）">
              <div className="set-model-pool">
                {modelOptions.length === 0 ? (
                  <p className="set-cell__muted">暂无可用模型，请先配置凭证</p>
                ) : (
                  modelOptions.map((opt) => (
                    <label key={opt.value} className="set-filter-check">
                      <input
                        type="checkbox"
                        checked={formModelIds.includes(opt.value)}
                        onChange={() => toggleModel(opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))
                )}
              </div>
            </Field>

            <Field label="首选模型" hint="优先使用此模型；不可用时回退">
              <Select<string>
                value={formPrimary ?? ''}
                options={poolOptions}
                onChange={(v) => setFormPrimary(v || null)}
                placeholder="选择首选模型"
              />
            </Field>

            <Field label="回退模型" hint="首选模型不可用时的备选">
              <Select<string>
                value={formFallback ?? ''}
                options={poolOptions}
                onChange={(v) => setFormFallback(v || null)}
                placeholder="选择回退模型（可选）"
              />
            </Field>
          </div>
        )}
      </Drawer>
    </SettingsPage>
  );
}
