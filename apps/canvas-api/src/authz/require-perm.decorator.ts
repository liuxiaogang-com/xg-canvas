import { SetMetadata } from '@nestjs/common';

import type { Scope } from './catalog';

export interface RequirePermMeta {
  permission: string;
  scope: Scope;
  /** Where the project id lives for a project-scoped check. */
  from?: 'param' | 'body' | 'query';
  /** Field name holding the project id (default: projectId for param, project_id otherwise). */
  key?: string;
  /** Project scope only: if the project id is absent, skip the check (the route
   *  also serves null-project / workspace-level resources gated elsewhere). */
  optional?: boolean;
}

export const REQUIRE_PERM = 'require_perm';

/**
 * Require a capability on a route. The same key string is used in the DB catalog
 * and the frontend can() — that is what makes the permission component-level.
 *   @RequirePerm('system.user.manage', { scope: 'system' })
 *   @RequirePerm('project.canvas.node.edit', { scope: 'project', from: 'param', key: 'projectId' })
 */
export const RequirePerm = (permission: string, opts: Omit<RequirePermMeta, 'permission'>) =>
  SetMetadata(REQUIRE_PERM, { permission, ...opts } satisfies RequirePermMeta);
