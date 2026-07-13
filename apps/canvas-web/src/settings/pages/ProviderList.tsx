/* Provider list — ported from account-admin ProviderList.tsx into the dark,
 * antd-free settings surface. Lists providers; row click opens detail; header
 * action opens a create modal. */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  SettingsPage,
  DataTable,
  Field,
  TextInput,
  Badge,
  BoolBadge,
  Loading,
  ErrorNote,
  type Column,
} from '../components/kit';
import { Modal, Select, toast } from '../../ui';
import { providerApi } from '../api';
import type { Provider } from '../types';

type AuthMethod = 'api_key' | 'oauth' | 'none';

const AUTH_OPTIONS: { value: AuthMethod; label: string }[] = [
  { value: 'api_key', label: 'API Key' },
  { value: 'oauth', label: 'OAuth' },
  { value: 'none', label: '无' },
];

interface CreateForm {
  slug: string;
  display_name: string;
  base_url: string;
  auth_method: AuthMethod;
}

const EMPTY_FORM: CreateForm = { slug: '', display_name: '', base_url: '', auth_method: 'api_key' };

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : '操作失败';
}

export default function ProviderList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await providerApi.list();
      setRows(list);
    } catch (e: unknown) {
      setError(errMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const submit = async () => {
    if (!form.slug.trim() || !form.display_name.trim()) {
      toast.warning('请填写 slug 与名称');
      return;
    }
    setSubmitting(true);
    try {
      await providerApi.create({
        slug: form.slug.trim(),
        display_name: form.display_name.trim(),
        base_url: form.base_url.trim() || null,
        auth_method: form.auth_method,
      });
      toast.success('创建成功');
      setModalOpen(false);
      await load();
    } catch (e: unknown) {
      toast.error(errMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<Provider>[] = [
    {
      key: 'display_name',
      header: '名称',
      render: (r) => (
        <div>
          <div>{r.display_name}</div>
          <div className="set-stat__sub">{r.slug}</div>
        </div>
      ),
    },
    {
      key: 'auth_method',
      header: '鉴权',
      render: (r) => <Badge tone="info">{r.auth_method}</Badge>,
    },
    {
      key: 'source',
      header: '模型来源',
      render: (r) => r.source,
    },
    {
      key: 'enabled',
      header: '状态',
      width: 96,
      render: (r) => <BoolBadge value={r.enabled} />,
    },
  ];

  const actions = (
    <button type="button" className="btn btn--primary" onClick={openCreate}>
      新建供应商
    </button>
  );

  const modalFooter = (
    <>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => setModalOpen(false)}
        disabled={submitting}
      >
        取消
      </button>
      <button type="button" className="btn btn--primary" onClick={() => void submit()} disabled={submitting}>
        {submitting ? '处理中…' : '创建'}
      </button>
    </>
  );

  return (
    <SettingsPage title="供应商" actions={actions}>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNote message={error} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/settings/providers/${r.id}`)}
          empty="暂无供应商"
        />
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="新建供应商"
        footer={modalFooter}
      >
        <Field label="Slug" hint="唯一标识，如 openai">
          <TextInput
            value={form.slug}
            placeholder="openai"
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
        </Field>
        <Field label="名称">
          <TextInput
            value={form.display_name}
            placeholder="OpenAI"
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          />
        </Field>
        <Field label="Base URL">
          <TextInput
            value={form.base_url}
            placeholder="https://api.openai.com/v1"
            onChange={(e) => setForm({ ...form, base_url: e.target.value })}
          />
        </Field>
        <Field label="鉴权方式">
          <Select<AuthMethod>
            value={form.auth_method}
            options={AUTH_OPTIONS}
            onChange={(v) => setForm({ ...form, auth_method: v })}
          />
        </Field>
      </Modal>
    </SettingsPage>
  );
}
