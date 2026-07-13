import type { ReactNode } from 'react';

import { usePermStore } from '../store/permissions';

/**
 * Component-level gate. Renders children only if the user holds `perm` (in the
 * given project, or system scope when no project). The same key string the
 * backend @RequirePerm checks.
 *   <Can perm="project.member.manage" project={pid}><AddMemberButton/></Can>
 */
export function Can({
  perm,
  project,
  children,
  fallback = null,
}: {
  perm: string;
  project?: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const ok = usePermStore((s) =>
    project ? (s.projectCaps[project] ?? s.systemCaps).has(perm) : s.systemCaps.has(perm),
  );
  return <>{ok ? children : fallback}</>;
}
