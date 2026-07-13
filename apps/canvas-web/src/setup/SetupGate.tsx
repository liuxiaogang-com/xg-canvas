import { useCallback, useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { setupApi } from '../api/auth';
import './setup.css';

export default function SetupGate() {
  const location = useLocation();
  const [required, setRequired] = useState<boolean | null>(null);
  const [error, setError] = useState(false);

  const check = useCallback(() => {
    setRequired(null);
    setError(false);
    setupApi.status().then((s) => setRequired(s.required)).catch(() => setError(true));
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  if (error) {
    return (
      <div className="setup-root">
        <main className="setup-card setup-gate-error">
          <div role="alert">无法连接到 XG Canvas 服务，请确认服务已启动。</div>
          <button className="btn btn--primary" type="button" onClick={check}>重新检查</button>
        </main>
      </div>
    );
  }
  if (required === null) {
    return <div className="app-shell__loading" role="status" aria-live="polite">正在检查实例状态…</div>;
  }
  if (required && location.pathname !== '/setup') return <Navigate to="/setup" replace />;
  if (!required && location.pathname === '/setup') return <Navigate to="/" replace />;
  return <Outlet context={{ finishSetup: () => setRequired(false) }} />;
}
