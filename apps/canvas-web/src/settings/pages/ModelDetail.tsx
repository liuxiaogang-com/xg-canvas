/* Model detail / edit — ported from account-admin ModelDetail.tsx.
 * Editable: display_name, description, enabled, and three JSON blobs
 * (param_schema / pricing / limits). Read-only: model_id, provider_model_id,
 * task_types. Renders with the dark settings kit (no antd). */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  SettingsPage,
  Field,
  TextInput,
  TextArea,
  Badge,
  Loading,
  ErrorNote,
} from '../components/kit';
import { Segmented, toast } from '../../ui';
import { modelApi } from '../api';
import type { ModelDefinition } from '../types';

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

export default function ModelDetail() {
  const { id } = useParams<{ id: string }>();
  const [model, setModel] = useState<ModelDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    if (!id) return;
    const patch: Partial<ModelDefinition> = {
      display_name: displayName,
      description: description.trim() ? description : null,
      enabled: enabled === 'yes',
    };
    for (const { key, label } of JSON_FIELDS) {
      const raw = json[key].trim();
      if (!raw) {
        patch[key] = null;
        continue;
      }
      try {
        (patch as Record<string, unknown>)[key] = JSON.parse(raw);
      } catch {
        toast.error(`${label} JSON 格式错误`);
        return;
      }
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

  return (
    <SettingsPage
      title={model.display_name ?? '模型'}
      description={model.description ?? undefined}
      actions={
        <>
          {back}
          <button
            className="btn btn--primary btn--sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '处理中…' : '保存'}
          </button>
        </>
      }
    >
      <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 16 }}>
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
          />
        </Field>
        <Field label="描述">
          <TextArea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
          <Field key={key} label={label} hint="JSON,留空表示 null">
            <TextArea
              rows={6}
              spellCheck={false}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
              value={json[key]}
              onChange={(e) => setJsonField(key, e.target.value)}
            />
          </Field>
        ))}
      </div>
    </SettingsPage>
  );
}
