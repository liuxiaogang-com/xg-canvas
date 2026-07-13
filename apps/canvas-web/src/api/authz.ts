import { api } from './client';

export interface MyPerms {
  caps: string[];
  is_super: boolean;
}
export interface RoleInfo {
  key: string;
  name_zh: string;
  scope_kind: string;
  is_system: boolean;
}
export interface ProjectMember {
  user_id: string;
  display_name: string;
  role_key: string;
  role_name: string;
  is_self: boolean;
}
export interface SystemUser {
  id: string;
  display_name: string;
  status: string;
  is_instance_owner: boolean;
  system_role: string | null;
  email: string | null;
}

export const authzApi = {
  mine: () => api<MyPerms>('/me/permissions'),
  project: (pid: string) => api<{ caps: string[] }>(`/projects/${pid}/permissions`),
  roles: () => api<RoleInfo[]>('/authz/roles'),

  members: (pid: string) => api<ProjectMember[]>(`/projects/${pid}/members`),
  addMember: (pid: string, email: string, role: string) =>
    api<void>(`/projects/${pid}/members`, { method: 'POST', body: { email, role } }),
  changeMemberRole: (pid: string, userId: string, role: string) =>
    api<void>(`/projects/${pid}/members/${userId}`, { method: 'PATCH', body: { role } }),
  removeMember: (pid: string, userId: string) =>
    api<void>(`/projects/${pid}/members/${userId}`, { method: 'DELETE' }),

  systemUsers: () => api<SystemUser[]>('/admin/rbac/users'),
  setSystemRole: (userId: string, role: string | null) =>
    api<void>(`/admin/rbac/users/${userId}/system-role`, { method: 'PUT', body: { role } }),
};
