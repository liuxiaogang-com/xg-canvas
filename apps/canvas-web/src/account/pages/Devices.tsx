import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  SettingsPage,
  DataTable,
  Badge,
  Loading,
  ErrorNote,
  type Column,
} from '../../settings/components/kit';
import { useAuthStore } from '../../store/auth';
import { accountApi } from '../api';
import type { SessionView } from '../types';

const VIA: Record<string, string> = {
  password: '密码',
  wechat: '微信',
  feishu: '飞书',
  phone: '手机',
  email: '邮箱',
  legacy_jwt: '历史会话',
};

export default function AccountDevices() {
  const [rows, setRows] = useState<SessionView[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const logout = useAuthStore((s) => s.logout);
  const nav = useNavigate();

  const load = useCallback(async () => {
    setErr(null);
    try {
      setRows(await accountApi.sessions());
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (id: string) => {
    setRows((rs) => rs?.filter((r) => r.id !== id) ?? rs); // optimistic
    try {
      await accountApi.revokeSession(id);
    } catch {
      load(); // rollback by refetch
    }
  };
  const logoutHere = async () => {
    await logout();
    nav('/auth');
  };

  const columns: Column<SessionView>[] = [
    {
      key: 'device',
      header: '设备',
      render: (r) => (
        <div>
          <div>
            {r.device_label ?? r.user_agent ?? '未知设备'}
            {r.is_current ? (
              <>
                {' '}
                <Badge tone="accent">本机</Badge>
              </>
            ) : null}
          </div>
          {r.last_ip ? <div className="set-page__desc">{r.last_ip}</div> : null}
        </div>
      ),
    },
    { key: 'via', header: '登录方式', render: (r) => <Badge>{VIA[r.created_via ?? ''] ?? '—'}</Badge> },
    { key: 'last', header: '最近活跃', render: (r) => relTime(r.last_seen_at) },
    {
      key: 'act',
      header: '操作',
      width: 120,
      render: (r) =>
        r.is_current ? (
          <button type="button" className="btn btn--ghost" onClick={logoutHere}>
            退出登录
          </button>
        ) : (
          <button type="button" className="btn btn--danger" onClick={() => revoke(r.id)}>
            移除设备
          </button>
        ),
    },
  ];

  if (err)
    return (
      <SettingsPage title="登录设备">
        <ErrorNote message={err} />
      </SettingsPage>
    );
  if (!rows)
    return (
      <SettingsPage title="登录设备">
        <Loading />
      </SettingsPage>
    );
  return (
    <SettingsPage title="登录设备" description="管理已登录的设备；移除某设备会让它在下一次请求时立即退出。">
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} empty="暂无登录设备" />
    </SettingsPage>
  );
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} 天前`;
  return new Date(iso).toLocaleDateString();
}
