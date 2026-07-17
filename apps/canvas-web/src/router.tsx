import { useEffect } from 'react';
import { createBrowserRouter, Navigate, Outlet, useNavigate } from 'react-router-dom';

import AuthPage from './auth/AuthPage';
import CanvasPage from './canvas/CanvasPage';
import AppShell from './components/AppShell';
import HomePage from './pages/HomePage';
import ProjectListPage from './pages/ProjectList';
import QuickGenPage from './pages/quick-gen/QuickGenPage';
import ChatPage from './pages/chat/ChatPage';
import AssetGlobalPage from './pages/assets/AssetGlobalPage';
import AssetProjectPage from './pages/assets/AssetProjectPage';
import LibraryPage from './pages/library/LibraryPage';
import PresetManagePage from './pages/PresetManagePage';
import AccountLayout from './account/AccountLayout';
import AccountProfile from './account/pages/Profile';
import AccountDevices from './account/pages/Devices';
import AccountLoginMethods from './account/pages/LoginMethods';
import ProjectMembers from './pages/ProjectMembers';
import RequireCap from './settings/RequireCap';
import RoleGate from './settings/RoleGate';
import SettingsLayout from './settings/SettingsLayout';
import SettingsSystemUsers from './settings/pages/SystemUsers';
import { usePermStore } from './store/permissions';
import { ensureRefresh } from './api/client';
import SettingsOverview from './settings/pages/Overview';
import SettingsProviderList from './settings/pages/ProviderList';
import SettingsProviderDetail from './settings/pages/ProviderDetail';
import SettingsModelList from './settings/pages/ModelList';
import SettingsModelDetail from './settings/pages/ModelDetail';
import SettingsCredentialList from './settings/pages/CredentialList';
import SettingsLogs from './settings/pages/Logs';
import SettingsUsage from './settings/pages/Usage';
import SettingsBilling from './settings/pages/Billing';
import SettingsFeatureConfig from './settings/pages/FeatureConfig';
import SettingsObjectStorage from './settings/pages/ObjectStorage';
import SettingsMail from './settings/pages/MailSettings';
import SetupGate from './setup/SetupGate';
import SetupPage from './setup/SetupPage';
import AdminReadinessBar from './readiness/AdminReadinessBar';
import SurfaceReadinessGate from './readiness/SurfaceReadinessGate';

import { useAuthStore } from './store/auth';

/** Bootstrap auth + redirect to /auth if anonymous. Used for every authed route. */
function AuthGate() {
  const auth = useAuthStore();
  const refresh = useAuthStore((s) => s.refresh);
  const nav = useNavigate();
  useEffect(() => {
    refresh();
  }, [refresh]);
  // Load RBAC capabilities once we have a user (drives can()/RoleGate).
  useEffect(() => {
    if (auth.me) usePermStore.getState().loadSystem();
  }, [auth.me]);
  useEffect(() => {
    if (!auth.me) return;
    const timer = window.setInterval(() => void ensureRefresh(), 15 * 60_000);
    return () => window.clearInterval(timer);
  }, [auth.me]);
  useEffect(() => {
    if (!auth.me && !auth.loading) nav('/auth');
  }, [auth.me, auth.loading, nav]);
  if (auth.loading || !auth.me) {
    return <div className="app-shell__loading">加载中…</div>;
  }
  return (
    <>
      <Outlet />
      <AdminReadinessBar />
      <SurfaceReadinessGate />
    </>
  );
}

export const router = createBrowserRouter([
  {
    element: <SetupGate />,
    children: [
      { path: '/setup', element: <SetupPage /> },
      { path: '/auth', element: <AuthPage /> },
      {
        element: <AuthGate />,
        children: [
      // Full-screen canvas — no sidebar
      { path: '/projects/:id/canvas', element: <CanvasPage /> },
      // Project entry redirects to canvas
      { path: '/projects/:id', element: <Navigate to="canvas" replace /> },
      // Sidebar layout for the rest
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'generate', element: <QuickGenPage /> },
          { path: 'generate/:conversationId', element: <QuickGenPage /> },
          { path: 'chat', element: <ChatPage /> },
          { path: 'chat/:conversationId', element: <ChatPage /> },
          { path: 'projects', element: <ProjectListPage /> },
          { path: 'projects/:id/members', element: <ProjectMembers /> },
          { path: 'projects/:id/assets', element: <AssetProjectPage /> },
          { path: 'assets', element: <AssetGlobalPage /> },
          { path: 'library', element: <LibraryPage /> },
          { path: 'presets', element: <PresetManagePage /> },
          {
            path: 'account',
            element: <AccountLayout />,
            children: [
              { index: true, element: <AccountProfile /> },
              { path: 'logins', element: <AccountLoginMethods /> },
              { path: 'devices', element: <AccountDevices /> },
            ],
          },
          {
            path: 'settings',
            element: <RoleGate />,
            children: [
              {
                element: <SettingsLayout />,
                children: [
                  { index: true, element: <SettingsOverview /> },
                  { path: 'users', element: <RequireCap cap="system.user.manage"><SettingsSystemUsers /></RequireCap> },
                  { path: 'providers', element: <RequireCap cap="system.model.manage"><SettingsProviderList /></RequireCap> },
                  { path: 'providers/:id', element: <RequireCap cap="system.model.manage"><SettingsProviderDetail /></RequireCap> },
                  { path: 'models', element: <RequireCap cap="system.model.manage"><SettingsModelList /></RequireCap> },
                  { path: 'models/:id', element: <RequireCap cap="system.model.manage"><SettingsModelDetail /></RequireCap> },
                  { path: 'credentials', element: <RequireCap cap="system.credential.manage"><SettingsCredentialList /></RequireCap> },
                  { path: 'logs', element: <RequireCap cap="system.request_log.view"><SettingsLogs /></RequireCap> },
                  { path: 'usage', element: <RequireCap cap="system.billing.view"><SettingsUsage /></RequireCap> },
                  { path: 'billing', element: <RequireCap cap="system.billing.view"><SettingsBilling /></RequireCap> },
                  { path: 'feature-config', element: <RequireCap cap="system.config.manage"><SettingsFeatureConfig /></RequireCap> },
                  { path: 'object-storage', element: <RequireCap cap="system.config.manage"><SettingsObjectStorage /></RequireCap> },
                  { path: 'mail', element: <RequireCap cap="system.config.manage"><SettingsMail /></RequireCap> },
                ],
              },
            ],
          },
        ],
      },
        ],
      },
    ],
  },
]);
