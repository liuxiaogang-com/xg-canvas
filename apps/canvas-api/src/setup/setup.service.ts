import { createHash } from 'node:crypto';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import { AuthService, type AuthResult, type LoginContext } from '../auth/auth.service';
import { IdentityService } from '../identity/identity.service';
import { normalizeEmail } from '../identity/normalize';
import { RedisService } from '../redis/redis.service';
import type { CompleteSetupDto } from './setup.dto';

interface SetupRow {
  completed_at: Date | null;
}

interface ExistingAdministrator {
  id: string;
  is_instance_owner: boolean;
}

@Injectable()
export class SetupService implements OnModuleInit {
  private readonly logger = new Logger(SetupService.name);
  // Completion is monotonic; pending state is always refreshed from PostgreSQL.
  private initialized = true;

  constructor(
    private readonly ds: DataSource,
    private readonly identities: IdentityService,
    private readonly auth: AuthService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureState();
  }

  async status() {
    return { required: await this.isRequired() };
  }

  async isRequired(): Promise<boolean> {
    if (!this.initialized) {
      const rows = await this.ds.query(`SELECT completed_at FROM account.instance_setup WHERE id=1`);
      if (rows[0]?.completed_at) this.initialized = true;
    }
    return !this.initialized;
  }

  async complete(dto: CompleteSetupDto, ctx: LoginContext): Promise<AuthResult> {
    // Do the cheap, permanent-state check before Redis and Argon2 work.
    await this.assertPending();
    await this.enforceAttemptLimit(ctx.ip ?? 'unknown');
    const passwordHash = await this.identities.hashPassword(dto.password);
    const userId = await this.ds.transaction(async (em) => {
      await em.query(`SELECT pg_advisory_xact_lock(hashtext('xgcanvas:instance-setup'))`);
      const rows = (await em.query(
        `SELECT completed_at FROM account.instance_setup WHERE id=1 FOR UPDATE`,
      )) as SetupRow[];
      if (!rows[0] || rows[0].completed_at) {
        throw new ConflictException({ code: 'SETUP_ALREADY_COMPLETED', message: '实例已完成初始化' });
      }

      const id = await this.identities.createPasswordUser(
        em,
        normalizeEmail(dto.email),
        passwordHash,
        dto.display_name.trim(),
      );
      const roles = await em.query(`SELECT id FROM canvas.roles WHERE key='it_super_admin' LIMIT 1`);
      if (!roles.length) throw new Error('it_super_admin role is not initialized');
      await em.query(
        `INSERT INTO canvas.role_bindings (user_id, role_id, scope_kind, scope_id)
           VALUES ($1,$2,'system',NULL)`,
        [id, roles[0].id],
      );
      await em.query(`UPDATE canvas.users SET is_instance_owner=true WHERE id=$1`, [id]);
      const completed = await em.query(
        `UPDATE account.instance_setup
           SET owner_user_id=$1, completed_at=now(), updated_at=now()
         WHERE id=1 AND completed_at IS NULL
         RETURNING id`,
        [id],
      );
      if (!completed.length) {
        throw new ConflictException({ code: 'SETUP_ALREADY_COMPLETED', message: '实例已完成初始化' });
      }
      return id;
    });
    this.initialized = true;
    this.logger.log(`instance setup completed: owner=${userId}`);
    // Session issuance intentionally happens after commit. If Redis is temporarily
    // unavailable, setup stays complete and the owner can use normal password login.
    return this.auth.issueForUserId(userId, ctx, 'setup');
  }

  private async ensureState(): Promise<void> {
    let adoptedUserId: string | null = null;
    await this.ds.transaction(async (em) => {
      await em.query(`SELECT pg_advisory_xact_lock(hashtext('xgcanvas:instance-setup'))`);
      const existing = (await em.query(
        `SELECT completed_at FROM account.instance_setup WHERE id=1 FOR UPDATE`,
      )) as SetupRow[];
      if (existing[0]?.completed_at) {
        this.initialized = true;
        return;
      }

      // Adopt pre-setup installations even if an old pending row already exists.
      const administrator = await this.findExistingAdministrator(em);
      if (administrator) {
        if (!administrator.is_instance_owner) {
          await em.query(`UPDATE canvas.users SET is_instance_owner=true WHERE id=$1`, [administrator.id]);
        }
        await em.query(
          `INSERT INTO account.instance_setup (id, owner_user_id, completed_at)
           VALUES (1,$1,now())
           ON CONFLICT (id) DO UPDATE
             SET owner_user_id=EXCLUDED.owner_user_id,
                 completed_at=EXCLUDED.completed_at,
                 updated_at=now()
           WHERE account.instance_setup.completed_at IS NULL`,
          [administrator.id],
        );
        adoptedUserId = administrator.id;
        this.initialized = true;
        return;
      }

      if (await this.hasAnyUsers(em)) {
        throw new Error(
          'INSTANCE_SETUP_RECOVERY_REQUIRED: users exist but no active instance owner or it_super_admin was found; run the documented recover:instance-owner command',
        );
      }

      await em.query(
        `INSERT INTO account.instance_setup (id) VALUES (1)
         ON CONFLICT (id) DO NOTHING`,
      );
      this.initialized = false;
    });
    if (adoptedUserId) {
      this.logger.log(`adopted existing administrator as instance owner: user=${adoptedUserId}`);
    } else if (!this.initialized) {
      this.logger.warn('实例尚未初始化。请在可信网络中打开 /setup 创建首位管理员。');
    }
  }

  private async assertPending(): Promise<void> {
    const rows = (await this.ds.query(
      `SELECT completed_at FROM account.instance_setup WHERE id=1`,
    )) as SetupRow[];
    if (rows[0]?.completed_at) {
      this.initialized = true;
      throw new ConflictException({ code: 'SETUP_ALREADY_COMPLETED', message: '实例已完成初始化' });
    }
    if (!rows[0]) {
      throw new ServiceUnavailableException({
        code: 'SETUP_STATE_UNAVAILABLE',
        message: '初始化状态尚未就绪',
      });
    }
  }

  private async enforceAttemptLimit(ip: string): Promise<void> {
    const client = this.redis.raw();
    const ipKey = `setup:attempt:ip:${createHash('sha256').update(ip).digest('hex').slice(0, 24)}`;
    const globalKey = 'setup:attempt:global';
    const ipCount = await client.incr(ipKey);
    if (ipCount === 1) await client.expire(ipKey, 60);
    const globalCount = await client.incr(globalKey);
    if (globalCount === 1) await client.expire(globalKey, 60);
    if (ipCount > 10 || globalCount > 30) {
      throw new HttpException(
        { code: 'SETUP_RATE_LIMITED', message: '初始化尝试过于频繁，请稍后再试' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async findExistingAdministrator(em: EntityManager): Promise<ExistingAdministrator | null> {
    const rows = (await em.query(
      `SELECT u.id, u.is_instance_owner
       FROM canvas.users u
       WHERE u.status='active' AND u.merged_into_user_id IS NULL
         AND (
           u.is_instance_owner=true OR EXISTS (
             SELECT 1
             FROM canvas.role_bindings b
             JOIN canvas.roles r ON r.id=b.role_id
             WHERE b.user_id=u.id AND b.scope_kind='system' AND r.key='it_super_admin'
           )
         )
       ORDER BY u.is_instance_owner DESC, u.created_at, u.id
       LIMIT 1`,
    )) as ExistingAdministrator[];
    return rows[0] ?? null;
  }

  private async hasAnyUsers(em: EntityManager): Promise<boolean> {
    const rows = await em.query(`SELECT EXISTS(SELECT 1 FROM canvas.users) AS exists`);
    return rows[0]?.exists === true;
  }
}
