import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { authzApi, type ProjectMember, type RoleInfo } from '../api/authz';
import { DataTable, Badge, ErrorNote, Loading, SettingsPage, type Column } from '../settings/components/kit';
import { usePermStore } from '../store/permissions';
import { toast } from '../ui';

export default function ProjectMembers() {
  const { id: pid } = useParams();
  const [rows, setRows] = useState<ProjectMember[] | null>(null);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const loadProject = usePermStore((s) => s.loadProject);
  const canManage = usePermStore((s) =>
    pid ? (s.projectCaps[pid] ?? s.systemCaps).has('project.member.manage') : false,
  );

  const load = useCallback(async () => {
    if (!pid) return;
    setErr(null);
    try {
      setRows(await authzApi.members(pid));
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败');
    }
  }, [pid]);

  useEffect(() => {
    load();
    authzApi.roles().then((r) => setRoles(r.filter((x) => x.scope_kind === 'project'))).catch(() => undefined);
    if (pid) loadProject(pid);
  }, [load, pid, loadProject]);

  const changeRole = async (userId: string, role: string) => {
    try {
      await authzApi.changeMemberRole(pid!, userId, role);
      toast.success('角色已更新');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新失败');
    }
  };
  const remove = async (userId: string) => {
    try {
      await authzApi.removeMember(pid!, userId);
      toast.success('已移除');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '移除失败');
    }
  };

  const columns: Column<ProjectMember>[] = [
    {
      key: 'name',
      header: '成员',
      render: (m) => (
        <span>
          {m.display_name}
          {m.is_self ? (
            <>
              {' '}
              <Badge tone="accent">我</Badge>
            </>
          ) : null}
        </span>
      ),
    },
    {
      key: 'role',
      header: '角色',
      render: (m) =>
        canManage && !m.is_self ? (
          <select
            className="input"
            value={m.role_key}
            onChange={(e) => changeRole(m.user_id, e.target.value)}
            style={{ width: 140 }}
          >
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name_zh}
              </option>
            ))}
          </select>
        ) : (
          <Badge>{m.role_name}</Badge>
        ),
    },
    {
      key: 'act',
      header: '操作',
      width: 90,
      render: (m) =>
        canManage && !m.is_self ? (
          <button type="button" className="btn btn--danger" onClick={() => remove(m.user_id)}>
            移除
          </button>
        ) : null,
    },
  ];

  if (err)
    return (
      <SettingsPage title="项目成员">
        <ErrorNote message={err} />
      </SettingsPage>
    );
  if (!rows)
    return (
      <SettingsPage title="项目成员">
        <Loading />
      </SettingsPage>
    );

  return (
    <SettingsPage
      title="项目成员"
      description={canManage ? '管理成员与项目角色（管理员 / 成员 / 游客）。' : '你没有管理成员的权限，仅可查看。'}
    >
      {canManage ? <AddMember roles={roles} onAdd={load} pid={pid!} /> : null}
      <DataTable columns={columns} rows={rows} rowKey={(m) => m.user_id} empty="暂无成员" />
    </SettingsPage>
  );
}

function AddMember({ roles, onAdd, pid }: { roles: RoleInfo[]; onAdd: () => void; pid: string }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('project_member');
  const submit = async () => {
    if (!email) return;
    try {
      await authzApi.addMember(pid, email, role);
      toast.success('已添加成员');
      setEmail('');
      onAdd();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '添加失败');
    }
  };
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
      <input
        className="input"
        placeholder="成员邮箱"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ flex: 1 }}
      />
      <select className="input" value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 140 }}>
        {roles.map((r) => (
          <option key={r.key} value={r.key}>
            {r.name_zh}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn--primary" onClick={submit}>
        添加成员
      </button>
    </div>
  );
}
