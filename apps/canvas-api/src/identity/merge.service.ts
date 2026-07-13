import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { AuthIdentity } from '../database/entities';
import { SessionService } from '../session/session.service';
import { loginMethodCount } from './identity-helpers';

/**
 * Account merge / re-bind state machine (Beta, "no-asset" merge only).
 *
 * force_bind — steal one identity (the whole WeChat family if union-keyed) from
 *   account Y into the caller. Y survives, but only if it keeps ≥1 login method.
 * full_merge — absorb Y entirely into the caller. Allowed only when Y owns no
 *   projects/tasks/assets/conversations/user-presets; Y is tombstoned, never
 *   physically deleted (RESTRICT FKs + audit trail).
 * Both demand the caller already proved control of the target identity (a
 * merge_confirm code or a fresh OAuth resolve) — enforced by the controller.
 */
@Injectable()
export class MergeService {
  constructor(
    @InjectRepository(AuthIdentity) private readonly identities: Repository<AuthIdentity>,
    private readonly ds: DataSource,
    private readonly sessions: SessionService,
  ) {}

  /** Move a proven identity from its current owner to the caller (Y survives). */
  async forceBind(callerUserId: string, provider: string, providerUid: string): Promise<void> {
    const idn = await this.identities.findOne({ where: { provider, provider_uid: providerUid } });
    if (!idn) throw new NotFoundException({ code: 'NOT_FOUND', message: '该登录方式不存在' });
    if (idn.user_id === callerUserId) return; // already mine
    const target = idn.user_id;

    const yIds = await this.identities.find({ where: { user_id: target } });
    const movedIds =
      idn.union_key && provider.startsWith('wechat')
        ? yIds.filter((i) => i.union_key === idn.union_key && i.provider.startsWith('wechat')).map((i) => i.id)
        : [idn.id];
    const remaining = yIds.filter((i) => !movedIds.includes(i.id));
    if (loginMethodCount(remaining) < 1) {
      throw new ConflictException({
        code: 'WOULD_ORPHAN_TARGET',
        message: '对方账户将失去唯一登录方式，无法强制绑定',
      });
    }

    await this.ds.transaction(async (em) => {
      await em.update(AuthIdentity, { id: In(movedIds) }, { user_id: callerUserId });
      await em.query(
        `UPDATE canvas.users SET primary_identity_id =
           (SELECT id FROM canvas.auth_identities WHERE user_id = $1 ORDER BY created_at LIMIT 1)
         WHERE id = $1 AND primary_identity_id = ANY($2::uuid[])`,
        [target, movedIds],
      );
      await em.query(
        `INSERT INTO canvas.account_merge_log
           (surviving_user_id, merged_user_id, kind, moved_identity_ids, operated_by)
         VALUES ($1, NULL, 'force_bind', $2::uuid[], $1)`,
        [callerUserId, movedIds],
      );
    });
    // Connected kick: the stolen identity's old owner loses live sessions.
    await this.sessions.revokeAllForUser(target, 'security');
  }

  /** Absorb account Y into the caller. Only when Y owns no content. */
  async fullMerge(callerUserId: string, targetUserId: string): Promise<void> {
    if (callerUserId === targetUserId) {
      throw new ConflictException({ code: 'SELF_MERGE', message: '不能与自己合并' });
    }
    // Never let a user absorb an admin account (would steal its powers).
    await this.assertNotPrivileged(targetUserId);
    const blocker = await this.assetBlocker(targetUserId);
    if (blocker) {
      throw new ConflictException({
        code: 'TARGET_HAS_ASSETS',
        message: `对方账户存在${blocker}，无法自助合并，请联系人工`,
      });
    }
    await this.doMerge(callerUserId, targetUserId, 'full_merge');
  }

  /**
   * Two accounts turned out to be the same person (late WeChat unionid). Absorb
   * whichever side has no content into the other and return the survivor; if both
   * have content, leave them separate and return the openid's account (absorb).
   */
  async trySilentMerge(keepCandidate: string, absorbCandidate: string): Promise<string> {
    if (keepCandidate === absorbCandidate) return keepCandidate;
    if (!(await this.assetBlocker(absorbCandidate))) {
      await this.doMerge(keepCandidate, absorbCandidate, 'silent_merge');
      return keepCandidate;
    }
    if (!(await this.assetBlocker(keepCandidate))) {
      await this.doMerge(absorbCandidate, keepCandidate, 'silent_merge');
      return absorbCandidate;
    }
    return absorbCandidate; // both have content — don't auto-merge
  }

  /** The merge itself (no precheck): move Y's identities/membership/workspaces to
   *  the survivor, tombstone Y, revoke its sessions, write audit. */
  private async doMerge(survivorId: string, mergedId: string, kind: string): Promise<void> {
    await this.ds.transaction(async (em) => {
      const yIds = await em.find(AuthIdentity, { where: { user_id: mergedId } });
      await em.update(AuthIdentity, { user_id: mergedId }, { user_id: survivorId });
      // workspace_members: drop Y's row where survivor is already a member, else move.
      await em.query(
        `DELETE FROM canvas.workspace_members ym
           WHERE ym.user_id = $2
             AND EXISTS (SELECT 1 FROM canvas.workspace_members xm
                          WHERE xm.workspace_id = ym.workspace_id AND xm.user_id = $1)`,
        [survivorId, mergedId],
      );
      await em.query(`UPDATE canvas.workspace_members SET user_id = $1 WHERE user_id = $2`, [survivorId, mergedId]);
      // Y owns no content (asset check passed) — transfer its (empty) workspaces.
      await em.query(`UPDATE canvas.workspaces SET owner_id = $1 WHERE owner_id = $2`, [survivorId, mergedId]);
      // Hand any privileged status to the survivor so a merge can never strand the
      // last super admin / instance owner (silent-merge path: same person).
      await em.query(
        `INSERT INTO canvas.role_bindings (user_id, role_id, scope_kind, scope_id, granted_by)
         SELECT $1, role_id, 'system', NULL, granted_by FROM canvas.role_bindings
          WHERE user_id = $2 AND scope_kind = 'system'
         ON CONFLICT DO NOTHING`,
        [survivorId, mergedId],
      );
      await em.query(`DELETE FROM canvas.role_bindings WHERE user_id = $1 AND scope_kind = 'system'`, [mergedId]);
      const wasOwner = await em.query(`SELECT is_instance_owner FROM canvas.users WHERE id = $1`, [mergedId]);
      if (wasOwner[0]?.is_instance_owner) {
        // Clear Y first — the single-owner partial unique index forbids two at once.
        await em.query(`UPDATE canvas.users SET is_instance_owner = false WHERE id = $1`, [mergedId]);
        await em.query(`UPDATE canvas.users SET is_instance_owner = true WHERE id = $1`, [survivorId]);
      }
      // Tombstone Y (never physically deleted: RESTRICT FKs + soft-redirect old tokens).
      await em.query(`UPDATE canvas.users SET status = 'disabled', merged_into_user_id = $1 WHERE id = $2`, [
        survivorId,
        mergedId,
      ]);
      await em.query(
        `INSERT INTO canvas.account_merge_log
           (surviving_user_id, merged_user_id, kind, moved_identity_ids, operated_by)
         VALUES ($1, $2, $3, $4::uuid[], $1)`,
        [survivorId, mergedId, kind, yIds.map((i) => i.id)],
      );
    });
    await this.sessions.revokeAllForUser(mergedId, kind === 'silent_merge' ? 'silent_merge' : 'merged');
  }

  /** Refuse to absorb an admin account into another (privilege-theft guard). */
  private async assertNotPrivileged(userId: string): Promise<void> {
    const owner = await this.ds.query(
      `SELECT 1 FROM canvas.users WHERE id = $1 AND is_instance_owner LIMIT 1`,
      [userId],
    );
    if (owner.length) {
      throw new ConflictException({ code: 'CANNOT_MERGE_INSTANCE_OWNER', message: '不能合并实例所有者账户' });
    }
    const sup = await this.ds.query(
      `SELECT 1 FROM canvas.role_bindings b JOIN canvas.roles r ON r.id = b.role_id
        WHERE b.user_id = $1 AND b.scope_kind = 'system' AND r.key = 'it_super_admin' LIMIT 1`,
      [userId],
    );
    if (sup.length) {
      throw new ConflictException({ code: 'CANNOT_MERGE_SUPER_ADMIN', message: '不能合并超级管理员账户' });
    }
  }

  /** Which content (if any) blocks merging the target account. */
  private async assetBlocker(userId: string): Promise<string | null> {
    const has = async (sql: string): Promise<boolean> =>
      Number((await this.ds.query(sql, [userId]))[0]?.c ?? 0) > 0;
    if (await has(`SELECT count(*)::int c FROM canvas.projects WHERE created_by = $1`)) return '项目';
    if (await has(`SELECT count(*)::int c FROM canvas.tasks WHERE owner_id = $1`)) return '任务';
    if (await has(`SELECT count(*)::int c FROM canvas.assets WHERE owner_id = $1 AND deleted_at IS NULL`))
      return '资产';
    if (await has(`SELECT count(*)::int c FROM canvas.conversations WHERE owner_id = $1`)) return '会话';
    if (await has(`SELECT count(*)::int c FROM canvas.prompt_presets WHERE owner_id = $1 AND scope = 'user'`))
      return '预设';
    return null;
  }
}
