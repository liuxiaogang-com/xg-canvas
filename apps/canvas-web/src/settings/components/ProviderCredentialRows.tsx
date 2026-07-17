import { useCallback, useEffect, useState } from 'react';

import { ApiError } from '../../api/client';
import { toast } from '../../ui';
import { credentialApi } from '../api';
import type { CredentialView } from '../types';
import {
  Badge,
  BoolBadge,
  DataTable,
  ErrorNote,
  Loading,
  type Column,
} from './kit';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return '加载凭证失败';
}

export function ProviderCredentialRows({
  channelResourceUid,
  refreshKey,
}: {
  channelResourceUid: string;
  refreshKey: number;
}) {
  const [rows, setRows] = useState<CredentialView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      setRows(await credentialApi.listByChannel(channelResourceUid));
    } catch (reason: unknown) {
      setError(errorMessage(reason));
    }
  }, [channelResourceUid]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const validate = async (id: string) => {
    setBusy(id);
    try {
      const result = await credentialApi.validate(id);
      result.is_valid
        ? toast.success('凭证有效')
        : toast.warning(result.validation_error ?? '凭证无效');
      await load();
    } catch (reason: unknown) {
      toast.error(errorMessage(reason));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('确认删除凭证？')) return;
    setBusy(id);
    try {
      await credentialApi.remove(id);
      toast.success('已删除');
      await load();
    } catch (reason: unknown) {
      toast.error(errorMessage(reason));
    } finally {
      setBusy(null);
    }
  };

  if (error) return <ErrorNote message={error} />;
  if (rows === null) return <Loading label="加载凭证…" />;

  const columns: Column<CredentialView>[] = [
    { key: 'label', header: '标签', render: (row) => row.label ?? '-' },
    { key: 'credential_type', header: '类型' },
    {
      key: 'payload_fields',
      header: '字段',
      render: (row) => row.payload_fields.map((field) => <Badge key={field}>{field}</Badge>),
    },
    {
      key: 'is_valid',
      header: '有效',
      width: 80,
      render: (row) => <BoolBadge value={row.is_valid} on="有效" off="无效" />,
    },
    {
      key: 'actions',
      header: '操作',
      width: 140,
      render: (row) => (
        <div className="set-row-actions">
          <button
            className="btn btn--ghost btn--sm"
            disabled={busy === row.id}
            onClick={() => void validate(row.id)}
          >
            {busy === row.id ? '处理中…' : '校验'}
          </button>
          <button
            className="btn btn--danger btn--sm"
            disabled={busy === row.id}
            onClick={() => void remove(row.id)}
          >
            删除
          </button>
        </div>
      ),
    },
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} empty="暂无凭证" />;
}
