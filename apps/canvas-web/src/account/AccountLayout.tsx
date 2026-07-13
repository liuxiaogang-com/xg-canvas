import { NavLink, Outlet } from 'react-router-dom';

import './account.css';

/** Personal-center shell, mirroring SettingsLayout. Lives at /account and is NOT
 *  behind RoleGate — every signed-in user manages their own account here. */
const TABS = [
  { to: '/account', label: '个人资料', end: true },
  { to: '/account/logins', label: '登录方式' },
  { to: '/account/devices', label: '登录设备' },
];

export default function AccountLayout() {
  return (
    <div className="set-root">
      <nav className="set-tabs">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => `set-tab${isActive ? ' set-tab--active' : ''}`}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <div className="set-outlet">
        <Outlet />
      </div>
    </div>
  );
}
