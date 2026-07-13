import { NavLink, Outlet } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useAuthStore } from '../store/auth';
import { useHasAnySystem } from '../store/permissions';
import ThemeSwitch from './ThemeSwitch';
import UserMenu from './UserMenu';
import './AppShell.css';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

/** Everyday surfaces — top of the rail. */
const TOP_NAV: NavItem[] = [
  { to: '/', label: '首页', end: true, icon: <path d="M3 11.5 12 4l9 7.5M5.5 10v9h5v-6h3v6h5v-9" /> },
  { to: '/generate', label: '快速生成', icon: <path d="M12 3l1.7 4.8L18.5 9.5l-4.8 1.7L12 16l-1.7-4.8L5.5 9.5l4.8-1.7z" /> },
  { to: '/chat', label: '对话', icon: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" /> },
  { to: '/projects', label: '项目', icon: <path d="M3 7a2 2 0 0 1 2-2h3.4l1.8 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /> },
  {
    to: '/assets',
    label: '资产库',
    icon: (
      <>
        <rect x="3.5" y="6.5" width="13" height="13" rx="2" />
        <path d="M7.5 6.5V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-1.5" />
      </>
    ),
  },
  {
    to: '/library',
    label: '资源库',
    icon: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20a7 7 0 0 1 14 0" />
        <path d="M19 5.5c1 .8 1 2.2 0 3" />
      </>
    ),
  },
];

/** Management surfaces (admin three-column pages) — pinned to the bottom of the rail. */
const MGMT_NAV: NavItem[] = [
  {
    to: '/presets',
    label: '预设',
    icon: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
        <circle cx="9" cy="7" r="2" />
        <circle cx="15" cy="12" r="2" />
        <circle cx="8" cy="17" r="2" />
      </>
    ),
  },
  {
    to: '/settings',
    label: '配置',
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </>
    ),
  },
];

function RailItem({ n }: { n: NavItem }) {
  return (
    <NavLink
      to={n.to}
      end={n.end}
      className={({ isActive }) => `rail__item${isActive ? ' is-active' : ''}`}
      title={n.label}
    >
      <span className="rail__icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {n.icon}
        </svg>
      </span>
      <span className="rail__label">{n.label}</span>
    </NavLink>
  );
}

export default function AppShell() {
  const auth = useAuthStore();
  // Gate 配置 on system-scope capability — same signal as RoleGate on /settings —
  // so any RBAC system role (sys_admin / it_super_admin) sees it, not just legacy role=admin.
  const hasSystem = useHasAnySystem();
  if (!auth.me) return null; // AuthGate guarantees a user; defensive for typing.

  // 配置 is admin-only; 预设 stays available to all. Both sit in the bottom (management) group.
  const mgmt = MGMT_NAV.filter((n) => n.to !== '/settings' || hasSystem);

  return (
    <div className="app-shell">
      <aside className="rail">
        <NavLink to="/" end className="rail__brand" aria-label="XG Canvas 首页">
          <span className="rail__brand-mark">XG</span>
        </NavLink>
        <nav className="rail__nav">
          {TOP_NAV.map((n) => (
            <RailItem key={n.to} n={n} />
          ))}
        </nav>
        <nav className="rail__nav rail__nav--bottom">
          {mgmt.map((n) => (
            <RailItem key={n.to} n={n} />
          ))}
        </nav>
      </aside>

      <main className="app-shell__main">
        <header className="app-shell__topbar">
          <ThemeSwitch />
          <UserMenu />
        </header>
        <div className="app-shell__content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
