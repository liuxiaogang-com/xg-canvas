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
import { Modal, toast } from '../../ui';
import { providerApi } from '../api';
import type { Provider } from '../types';
import { CatalogOriginBadge } from '../components/CatalogOriginBadge';

interface CreateForm {
  slug: string;
  display_name: string;
  base_url: string;
  enabled: boolean;
}

const EMPTY_FORM: CreateForm = {
  slug: '',
  display_name: '',
  base_url: '',
  enabled: true,
};

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
    if (!form.slug.trim() || !form.display_name.trim() || !form.base_url.trim()) {
      toast.warning('请填写 slug、名称与 Base URL');
      return;
    }
    setSubmitting(true);
    try {
      const created = await providerApi.create({
        slug: form.slug.trim(),
        display_name: form.display_name.trim(),
        base_url: form.base_url.trim(),
        auth_method: 'api_key',
        adapter_keys: ['openai-compat'],
        invocation_methods: ['http'],
        enabled: form.enabled,
      });
      toast.success('供应商已创建，请继续创建一个明确的调用渠道');
      setModalOpen(false);
      navigate(`/settings/providers/${created.resource_uid}`);
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
      key: 'origin',
      header: '来源',
      render: (r) => <CatalogOriginBadge origin={r.origin} />,
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
          rowKey={(r) => r.resource_uid}
          onRowClick={(r) => navigate(`/settings/providers/${r.resource_uid}`)}
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
        <Field label="当前接入契约">
          <div className="set-stat__sub">
            OpenAI-compatible HTTP + API Key。OAuth、免鉴权和自定义凭证表单尚未开放。
          </div>
        </Field>
        <Field label="创建后启用">
          <label className="set-filter-check">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
            />
            {form.enabled ? '启用' : '停用'}
          </label>
        </Field>
      </Modal>
    </SettingsPage>
  );
}
