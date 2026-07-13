import { useEffect, useState } from 'react';

import { Modal, Select, toast } from '../ui';
import { presetApi, type Preset } from '../api/preset';
import {
  SettingsPage,
  DataTable,
  Badge,
  Loading,
  ErrorNote,
  Field,
  TextInput,
  type Column,
} from '../settings/components/kit';
import '../settings/settings.css';

const TASK_TYPES = ['gen.text', 'gen.image', 'gen.video', 'gen.audio'];

type ScopeFilter = 'all' | 'system' | 'user';
const SCOPES: { value: ScopeFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'system', label: '系统预设' },
  { value: 'user', label: '用户预设' },
];

/** 预设 — admin three-column layout (rail | scope sub-nav | content), consistent with 配置. */
export default function PresetManagePage() {
  const [rows, setRows] = useState<Preset[] | null>(null);
  const [error, setError] = useState('');
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [creating, setCreating] = useState(false);

  const reload = () =>
    presetApi
      .list()
      .then((r) => {
        setRows(r);
        setError('');
      })
      .catch((e) => setError((e as Error).message));
  useEffect(() => {
    void reload();
  }, []);

  const visible = (rows ?? []).filter((p) => scope === 'all' || p.scope === scope);

  const columns: Column<Preset>[] = [
    {
      key: 'scope',
      header: '范围',
      width: 90,
      render: (p) => <Badge tone={p.scope === 'system' ? 'info' : 'default'}>{p.scope}</Badge>,
    },
    { key: 'task_type', header: '任务类型', width: 130, render: (p) => p.task_type },
    { key: 'title', header: '标题', render: (p) => p.title },
    {
      key: 'actions',
      header: '操作',
      width: 90,
      render: (p) =>
        p.scope === 'user' ? (
          <button
            type="button"
            className="btn btn--danger btn--sm"
            onClick={async () => {
              await presetApi.remove(p.id);
              await reload();
            }}
          >
            删除
          </button>
        ) : (
          <span className="set-stat__sub">—</span>
        ),
    },
  ];

  return (
    <div className="set-root">
      <nav className="set-tabs">
        {SCOPES.map((s) => (
          <button
            key={s.value}
            type="button"
            className={`set-tab${scope === s.value ? ' set-tab--active' : ''}`}
            onClick={() => setScope(s.value)}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <div className="set-outlet">
        <SettingsPage
          title="提示词预设"
          actions={
            <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
              新建预设
            </button>
          }
        >
          {error ? (
            <ErrorNote message={error} />
          ) : rows === null ? (
            <Loading />
          ) : (
            <DataTable columns={columns} rows={visible} rowKey={(p) => p.id} empty="暂无预设" />
          )}
        </SettingsPage>
      </div>

      {creating && (
        <Modal open onClose={() => setCreating(false)} title="新建预设">
          <CreatePresetForm
            onCancel={() => setCreating(false)}
            onCreated={async () => {
              setCreating(false);
              await reload();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function CreatePresetForm({ onCancel, onCreated }: { onCancel(): void; onCreated(): void }) {
  const [title, setTitle] = useState('');
  const [taskType, setTaskType] = useState(TASK_TYPES[0]);
  const [text, setText] = useState('');

  const submit = async () => {
    if (!title.trim()) return toast.error('请填写标题');
    if (!taskType) return toast.error('请选择任务类型');
    if (!text.trim()) return toast.error('请填写内容');
    try {
      await presetApi.create({ task_type: taskType, title, content: [{ role: 'system', text }] });
      onCreated();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label="标题">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="作用任务类型">
        <Select<string>
          value={taskType}
          onChange={setTaskType}
          options={TASK_TYPES.map((t) => ({ value: t, label: t }))}
        />
      </Field>
      <Field label="内容(system)">
        <textarea className="textarea" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn--secondary" onClick={onCancel}>
          取消
        </button>
        <button type="submit" className="btn btn--primary">
          创建
        </button>
      </div>
    </form>
  );
}
