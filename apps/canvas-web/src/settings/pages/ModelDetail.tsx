/* Model detail / edit — ported from account-admin ModelDetail.tsx.
 * Editable: display_name, description, enabled, and three JSON blobs
 * (param_schema / pricing / limits). Read-only: model_id, provider_model_id,
 * task_types. Renders with the dark settings kit (no antd). */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  SettingsPage,
  Field,
  TextInput,
  TextArea,
  Badge,
  Loading,
  ErrorNote,
} from '../components/kit';
import { Modal, Segmented, toast } from '../../ui';
import { modelApi, type UpdateModelInput } from '../api';
import type { ModelDefinition } from '../types';
import { CatalogOriginBadge } from '../components/CatalogOriginBadge';

type JsonField = 'param_schema' | 'pricing' | 'limits';
const JSON_FIELDS: { key: JsonField; label: string }[] = [
  { key: 'param_schema', label: 'param_schema' },
  { key: 'pricing', label: 'pricing' },
  { key: 'limits', label: 'limits' },
];

function toJsonText(value: unknown): string {
  return value == null ? '' : JSON.stringify(value, null, 2);
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export default function ModelDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [model, setModel] = useState<ModelDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [forkOpen, setForkOpen] = useState(false);
  const [forking, setForking] = useState(false);
  const [forkModelId, setForkModelId] = useState('');
  const [forkDisplayName, setForkDisplayName] = useState('');

  // editable form state
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState<'yes' | 'no'>('yes');
  const [json, setJson] = useState<Record<JsonField, string>>({
    param_schema: '',
    pricing: '',
    limits: '',
  });

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setError(null);
    modelApi
      .get(id)
      .then((m) => {
        if (!alive) return;
        setModel(m);
        setDisplayName(m.display_name);
        setDescription(m.description ?? '');
        setEnabled(m.enabled ? 'yes' : 'no');
        setJson({
          param_schema: toJsonText(m.param_schema),
          pricing: toJsonText(m.pricing),
          limits: toJsonText(m.limits),
        });
      })
      .catch((e: unknown) => alive && setError(errMsg(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  const setJsonField = (key: JsonField, value: string) =>
    setJson((prev) => ({ ...prev, [key]: value }));

  async function handleSave() {
    if (!id || !model) return;
    const patch: UpdateModelInput = { enabled: enabled === 'yes' };
    if (model.origin.kind === 'local') {
      let modelRevisionChanged = false;
      const nextDescription = description.trim();
      if (displayName !== model.display_name) {
        patch.display_name = displayName;
        modelRevisionChanged = true;
      }
      if (nextDescription !== (model.description ?? '')) {
        patch.description = nextDescription;
        modelRevisionChanged = true;
      }
      for (const { key, label } of JSON_FIELDS) {
        const raw = json[key].trim();
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown> | null;
          if (key !== 'pricing' && parsed === null) {
            toast.error(`${label} 不能为 null`);
            return;
          }
          if (!sameJson(parsed, model[key])) {
            (patch as Record<string, unknown>)[key] = parsed;
            if (key !== 'pricing') modelRevisionChanged = true;
          }
        } catch {
          toast.error(`${label} JSON 格式错误`);
          return;
        }
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'pricing')) {
        if (patch.pricing === null || model.rate_card_revision === null) {
          modelRevisionChanged = true;
        } else {
          patch.expected_rate_revision = model.rate_card_revision;
        }
      }
      if (modelRevisionChanged) patch.expected_revision = model.origin.revision;
    }
    setSaving(true);
    try {
      const updated = await modelApi.update(id, patch);
      setModel(updated);
      toast.success('已保存');
    } catch (e: unknown) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  function openFork() {
    if (!model) return;
    setForkModelId(`${model.model_id}-custom`);
    setForkDisplayName(`${model.display_name}（自定义）`);
    setForkOpen(true);
  }

  async function handleFork() {
    if (!id || !model || !forkModelId.trim()) return;
    setForking(true);
    try {
      const forked = await modelApi.fork(id, {
        expected_source_revision: model.origin.revision,
        new_model_id: forkModelId.trim(),
        display_name: forkDisplayName.trim() || undefined,
      });
      toast.success('已派生为本地自定义模型');
      setForkOpen(false);
      navigate(`/settings/models/${forked.resource_uid}`);
    } catch (e: unknown) {
      toast.error(errMsg(e));
    } finally {
      setForking(false);
    }
  }

  async function handleRemove() {
    if (!id || !window.confirm('确认退役这个本地模型？历史任务仍会保留固定修订。')) return;
    setRemoving(true);
    try {
      await modelApi.remove(id);
      toast.success('模型已退役');
      navigate('/settings/models');
    } catch (e: unknown) {
      toast.error(errMsg(e));
    } finally {
      setRemoving(false);
    }
  }

  const back = (
    <Link className="btn btn--ghost btn--sm" to="/settings/models">
      返回列表
    </Link>
  );

  if (loading) {
    return (
      <SettingsPage title="模型" actions={back}>
        <Loading />
      </SettingsPage>
    );
  }
  if (error || !model) {
    return (
      <SettingsPage title="模型" actions={back}>
        <ErrorNote message={error ?? '未找到模型'} />
      </SettingsPage>
    );
  }

  const official = model.origin.kind === 'official';

  return (
    <SettingsPage
      title={model.display_name ?? '模型'}
      description={model.description ?? undefined}
      actions={
        <>
          {back}
          {official ? (
            <button className="btn btn--secondary btn--sm" onClick={openFork} disabled={saving || forking}>
              派生为自定义模型
            </button>
          ) : (
            <button className="btn btn--danger btn--sm" onClick={handleRemove} disabled={saving || removing}>
              {removing ? '处理中…' : '退役'}
            </button>
          )}
          <button
            className="btn btn--primary btn--sm"
            onClick={handleSave}
            disabled={saving || removing || forking}
          >
            {saving ? '处理中…' : '保存'}
          </button>
        </>
      }
    >
      <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <dl className="set-detail-grid">
          <dt>来源</dt><dd><CatalogOriginBadge origin={model.origin} /></dd>
          <dt>资源 ID</dt><dd><code>{model.origin.resource_uid}</code></dd>
          <dt>修订 ID</dt><dd><code>{model.origin.revision_id}</code></dd>
          {model.origin.release_id ? <><dt>发布 ID</dt><dd><code>{model.origin.release_id}</code></dd></> : null}
        </dl>
        <Field label="Model ID">
          <TextInput value={model.model_id} readOnly disabled />
        </Field>
        <Field label="上游模型 ID">
          <TextInput value={model.provider_model_id} readOnly disabled />
        </Field>
        <Field label="任务类型">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {model.task_types.length === 0 ? (
              <span className="field__hint">无</span>
            ) : (
              model.task_types.map((t) => (
                <Badge key={t} tone="info">
                  {t}
                </Badge>
              ))
            )}
          </div>
        </Field>

        <Field label="名称">
          <TextInput
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            readOnly={official}
            disabled={official}
          />
        </Field>
        <Field label="描述">
          <TextArea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            readOnly={official}
            disabled={official}
          />
        </Field>
        <Field label="启用">
          <Segmented<'yes' | 'no'>
            value={enabled}
            onChange={setEnabled}
            options={[
              { value: 'yes', label: '启用' },
              { value: 'no', label: '停用' },
            ]}
          />
        </Field>

        {JSON_FIELDS.map(({ key, label }) => (
          <Field key={key} label={label} hint="JSON；留空表示不修改">
            <TextArea
              rows={6}
              spellCheck={false}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
              value={json[key]}
              onChange={(e) => setJsonField(key, e.target.value)}
              readOnly={official}
              disabled={official}
            />
          </Field>
        ))}
      </div>

      <Modal
        open={forkOpen}
        onClose={() => setForkOpen(false)}
        title="派生为本地自定义模型"
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setForkOpen(false)} disabled={forking}>取消</button>
            <button className="btn btn--primary" onClick={handleFork} disabled={forking || !forkModelId.trim()}>
              {forking ? '处理中…' : '创建副本'}
            </button>
          </>
        }
      >
        <Field label="新 Model ID" hint="必须唯一；创建后可以继续修改结构字段。">
          <TextInput value={forkModelId} onChange={(e) => setForkModelId(e.target.value)} />
        </Field>
        <Field label="显示名称">
          <TextInput value={forkDisplayName} onChange={(e) => setForkDisplayName(e.target.value)} />
        </Field>
      </Modal>
    </SettingsPage>
  );
}
