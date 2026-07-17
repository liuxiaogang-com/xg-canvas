import { NavLink, Outlet } from 'react-router-dom';

import { usePermStore } from '../store/permissions';
import './settings.css';

// Grouped side-nav. Each tab declares the system capability it needs; tabs the
// user lacks are hidden, and a group with no visible tab drops out entirely
// (cap undefined = always shown). RoleGate already gates the whole area.
interface Tab {
  to: string;
  label: string;
  end?: boolean;
  cap?: string;
}
const GROUPS: { title?: string; items: Tab[] }[] = [
  { items: [{ to: '/settings', label: '概览', end: true }] },
  {
    title: '模型接入',
    items: [
      { to: '/settings/credentials', label: '凭证', cap: 'system.credential.manage' },
      { to: '/settings/providers', label: '供应商', cap: 'system.model.manage' },
      { to: '/settings/models', label: '模型', cap: 'system.model.manage' },
      { to: '/settings/feature-config', label: '功能配置', cap: 'system.config.manage' },
    ],
  },
  {
    title: '通信与存储',
    items: [
      { to: '/settings/object-storage', label: '对象存储', cap: 'system.config.manage' },
      { to: '/settings/mail', label: '邮件', cap: 'system.config.manage' },
    ],
  },
  {
    title: '身份与访问',
    items: [
      { to: '/settings/users', label: '用户与角色', cap: 'system.user.manage' },
    ],
  },
  {
    title: '观测运营',
    items: [
      { to: '/settings/logs', label: '日志', cap: 'system.request_log.view' },
      { to: '/settings/usage', label: '用量统计', cap: 'system.billing.view' },
      { to: '/settings/billing', label: '计费', cap: 'system.billing.view' },
    ],
  },
];

export default function SettingsLayout() {
  const systemCaps = usePermStore((s) => s.systemCaps);
  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((t) => !t.cap || systemCaps.has(t.cap)),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="set-root">
      <nav className="set-tabs">
        {groups.map((g, i) => (
          <div className="set-tab-group" key={g.title ?? `g${i}`}>
            {g.title ? <div className="set-tab-group__title">{g.title}</div> : null}
            {g.items.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) => `set-tab${isActive ? ' set-tab--active' : ''}`}
              >
                {t.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="set-outlet">
        <Outlet />
      </div>
    </div>
  );
}
