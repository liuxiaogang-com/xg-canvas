import type { ReactNode } from 'react';

import { Can } from '../auth/Can';
import { ErrorNote, SettingsPage } from './components/kit';

/**
 * Route-level system-capability gate for a /settings sub-page. Tabs are already
 * hidden in SettingsLayout, but a user can still hit the URL directly (or have a
 * cap revoked mid-session) — show a friendly notice instead of a raw 403.
 */
export default function RequireCap({ cap, children }: { cap: string; children: ReactNode }) {
  return (
    <Can
      perm={cap}
      fallback={
        <SettingsPage title="无权限">
          <ErrorNote message="你没有访问此页面的权限,请联系系统管理员。" />
        </SettingsPage>
      }
    >
      {children}
    </Can>
  );
}
