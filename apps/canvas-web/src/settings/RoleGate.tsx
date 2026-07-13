import { Navigate, Outlet } from 'react-router-dom';

import { useAuthStore } from '../store/auth';
import { usePermStore } from '../store/permissions';

/** Gate the /settings (admin) area by system-scope capability. AuthGate already
 *  guarantees a session + loads permissions; here we bounce users with no
 *  system capability back to the workspace. */
export default function RoleGate() {
  const me = useAuthStore((s) => s.me);
  const permLoaded = usePermStore((s) => s.loaded);
  const hasSystem = usePermStore((s) => s.systemCaps.size > 0 || s.isSuper);
  if (!me || !permLoaded) return null;
  if (!hasSystem) return <Navigate to="/generate" replace />;
  return <Outlet />;
}
