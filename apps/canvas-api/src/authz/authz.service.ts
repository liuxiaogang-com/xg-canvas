import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AuthzAudit, User } from '../database/entities';
import { Keys } from '../redis/keys';
import { RedisService } from '../redis/redis.service';
import { ALL_PERMISSION_KEYS, type Scope } from './catalog';

const CACHE_TTL = 300;

/**
 * Effective-permission resolution. A user's capabilities in a scope =
 *   system-binding caps  ∪  (project-binding caps for that project).
 * Because a system role can contain project-scoped caps (e.g. sys_admin has
 * project.read), system bindings apply to every project — that's "系统覆盖项目".
 * Super admin / instance owner short-circuit to the full set. Resolved sets are
 * cached in Redis and invalidated per-user on any binding/role change.
 */
@Injectable()
export class AuthzService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AuthzAudit) private readonly auditRepo: Repository<AuthzAudit>,
    private readonly ds: DataSource,
    private readonly redis: RedisService,
  ) {}

  /** Unconditionally all-powerful: instance owner, or a system it_super_admin
   *  binding. A disabled or merged account is never super (defense vs lockout/
   *  stolen-tombstone). */
  async isSuperOrOwner(userId: string): Promise<boolean> {
    const u = await this.users.findOne({
      where: { id: userId },
      select: { id: true, is_instance_owner: true, status: true, merged_into_user_id: true },
    });
    if (!u || u.status !== 'active' || u.merged_into_user_id) return false;
    if (u.is_instance_owner) return true;
    const rows = await this.ds.query(
      `SELECT 1 FROM canvas.role_bindings b JOIN canvas.roles r ON r.id = b.role_id
       WHERE b.user_id = $1 AND b.scope_kind = 'system' AND r.key = 'it_super_admin' LIMIT 1`,
      [userId],
    );
    return rows.length > 0;
  }

  /** The capabilities a user holds in a scope (system caps unioned in for projects). */
  async resolveCapabilities(userId: string, scopeKind: Scope, scopeId: string | null): Promise<Set<string>> {
    if (await this.isSuperOrOwner(userId)) return new Set(ALL_PERMISSION_KEYS);

    const cacheKey = Keys.authz.caps(userId, scopeKind, scopeId);
    const cached = await this.redis.get(cacheKey);
    if (cached) return new Set(JSON.parse(cached) as string[]);

    const caps = new Set<string>();
    // System bindings apply everywhere (incl. their project-scoped caps).
    const sys = await this.ds.query(
      `SELECT rp.permission_key FROM canvas.role_bindings b
         JOIN canvas.role_permissions rp ON rp.role_id = b.role_id
       WHERE b.user_id = $1 AND b.scope_kind = 'system'`,
      [userId],
    );
    for (const r of sys) caps.add(r.permission_key);

    if (scopeKind === 'project' && scopeId) {
      const proj = await this.ds.query(
        `SELECT rp.permission_key FROM canvas.role_bindings b
           JOIN canvas.role_permissions rp ON rp.role_id = b.role_id
         WHERE b.user_id = $1 AND b.scope_kind = 'project' AND b.scope_id = $2`,
        [userId, scopeId],
      );
      for (const r of proj) caps.add(r.permission_key);
    }

    await this.redis.set(cacheKey, JSON.stringify([...caps]), CACHE_TTL);
    await this.redis.raw().sadd(Keys.authz.userSet(userId), cacheKey);
    return caps;
  }

  async can(userId: string, permission: string, scopeKind: Scope, scopeId: string | null): Promise<boolean> {
    return (await this.resolveCapabilities(userId, scopeKind, scopeId)).has(permission);
  }

  /**
   * Project ids where the user holds a project-scoped capability. Returns 'ALL'
   * when a system binding (or super/owner) already grants it everywhere. Used
   * for cross-project list filtering (e.g. workspace-wide asset views).
   */
  async projectIdsWithCap(userId: string, permission: string): Promise<'ALL' | string[]> {
    const systemCaps = await this.resolveCapabilities(userId, 'system', null);
    if (systemCaps.has(permission)) return 'ALL';
    const rows: Array<{ scope_id: string }> = await this.ds.query(
      `SELECT DISTINCT b.scope_id FROM canvas.role_bindings b
         JOIN canvas.role_permissions rp ON rp.role_id = b.role_id
       WHERE b.user_id = $1 AND b.scope_kind = 'project' AND b.scope_id IS NOT NULL
         AND rp.permission_key = $2`,
      [userId, permission],
    );
    return rows.map((r) => r.scope_id);
  }

  /** Drop a user's cached capability sets (call on any binding/role change). */
  async invalidate(userId: string): Promise<void> {
    const setKey = Keys.authz.userSet(userId);
    const members = await this.redis.raw().smembers(setKey);
    if (members.length) await this.redis.del(...members);
    await this.redis.del(setKey);
  }

  /** Invalidate every user holding a role (call when a role's permission set
   *  changes — e.g. seed refresh or a custom-role edit). */
  async invalidateByRoleId(roleId: string): Promise<void> {
    const rows = await this.ds.query(
      `SELECT DISTINCT user_id FROM canvas.role_bindings WHERE role_id = $1`,
      [roleId],
    );
    for (const r of rows) await this.invalidate(r.user_id);
  }

  /** Role list for assignment dropdowns. */
  listRoles(): Promise<Array<{ key: string; name_zh: string; scope_kind: string; is_system: boolean }>> {
    return this.ds.query(`SELECT key, name_zh, scope_kind, is_system FROM canvas.roles ORDER BY scope_kind, key`);
  }

  /** Best-effort audit row (never blocks the operation). */
  async audit(entry: Partial<AuthzAudit>): Promise<void> {
    try {
      await this.auditRepo.save(this.auditRepo.create(entry));
    } catch {
      /* audit is best-effort */
    }
  }
}
