import { useCallback, useEffect, useState } from 'react';

import { authzApi, type SystemUser } from '../../api/authz';
import { usePermStore } from '../../store/permissions';
import { toast } from '../../ui';
import { DataTable, Badge, ErrorNote, Loading, SettingsPage, type Column } from '../components/kit';

const ROLE_LABEL: Record<string, string> = {
  sys_admin: '系统管理员',
  it_super_admin: 'IT 超级管理员',
};

export default function SystemUsers() {
  const [rows, setRows] = useState<SystemUser[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const canAssignSuper = usePermStore((s) => s.systemCaps.has('system.user.assign_super_admin'));

  const load = useCallback(async () => {
    setErr(null);
    try {
      setRows(await authzApi.systemUsers());
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const setRole = async (id: string, role: string) => {
    try {
      await authzApi.setSystemRole(id, role || null);
      toast.success('系统角色已更新');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新失败');
    }
  };

  const columns: Column<SystemUser>[] = [
    {
      key: 'user',
      header: '用户',
      render: (u) => (
        <span>
          {u.display_name}
          {u.is_instance_owner ? (
            <>
              {' '}
              <Badge tone="accent">实例 owner</Badge>
            </>
          ) : null}
          {u.email ? <div className="set-page__desc">{u.email}</div> : null}
        </span>
      ),
    },
    {
      key: 'role',
      header: '系统角色',
      render: (u) => (
        <select
          className="input"
          value={u.system_role ?? ''}
          onChange={(e) => setRole(u.id, e.target.value)}
          style={{ width: 160 }}
          disabled={u.is_instance_owner}
        >
          <option value="">普通用户</option>
          <option value="sys_admin">系统管理员</option>
          {canAssignSuper || u.system_role === 'it_super_admin' ? (
            <option value="it_super_admin">IT 超级管理员</option>
          ) : null}
        </select>
      ),
    },
    { key: 'status', header: '状态', render: (u) => <Badge tone={u.status === 'active' ? 'success' : 'default'}>{u.status}</Badge> },
  ];

  if (err)
    return (
      <SettingsPage title="用户与角色">
        <ErrorNote message={err} />
      </SettingsPage>
    );
  if (!rows)
    return (
      <SettingsPage title="用户与角色">
        <Loading />
      </SettingsPage>
    );
  return (
    <SettingsPage title="用户与角色" description="管理用户的系统角色（系统管理员 / 超级管理员）。">
      <DataTable columns={columns} rows={rows} rowKey={(u) => u.id} empty="暂无用户" />
      <p className="set-page__desc" style={{ marginTop: 8 }}>
        {ROLE_LABEL.sys_admin}：日常运营 + 跨项目只读。{ROLE_LABEL.it_super_admin}：全权（不可被移除到归零）。
      </p>
    </SettingsPage>
  );
}
