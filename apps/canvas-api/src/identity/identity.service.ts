import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, type EntityManager } from 'typeorm';

import { AuthIdentity, User, Workspace, WorkspaceMember } from '../database/entities';
import { PasswordService } from '../auth/password.service';
import { identityLabel, loginMethodCount, type IdentityView } from './identity-helpers';
import { MergeService } from './merge.service';
import { normalizeEmail, normalizePhone } from './normalize';

/** A login resolved from any provider, ready to be matched-or-created into a user. */
export interface ResolvedIdentity {
  provider: string; // email | phone | wechat_mp | wechat_oa | wechat_open | feishu | wecom | ...
  providerUid: string; // normalized stable key (unionid>openid, E.164, lower email, ...)
  unionKey?: string | null;
  appId?: string | null;
  openid?: string | null;
  rawProfile?: Record<string, unknown>;
  displayName?: string | null;
  avatarUrl?: string | null;
}

const WECHAT_FAMILY = ['wechat_mp', 'wechat_oa', 'wechat_open'];

/** Owns identities + the find-or-create funnel: any login source resolves to one
 *  user, with WeChat unionid merging multiple openids into the same person. */
@Injectable()
export class IdentityService {
  constructor(
    @InjectRepository(AuthIdentity) private readonly identities: Repository<AuthIdentity>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly passwords: PasswordService,
    private readonly merge: MergeService,
    private readonly ds: DataSource,
  ) {}

  /** Resolve any provider login to a user id, creating the user on first sight. */
  async findOrCreate(r: ResolvedIdentity): Promise<string> {
    // 1. Union match: a WeChat unionid (or feishu union_id) ties prior openids to one person.
    let unionUserId: string | null = null;
    if (r.unionKey) {
      const family = r.provider.startsWith('wechat') ? WECHAT_FAMILY : [r.provider];
      const hit = await this.identities.findOne({ where: { provider: In(family), union_key: r.unionKey } });
      if (hit) unionUserId = hit.user_id;
    }
    // 2. Exact match on (provider, provider_uid) — already-known login.
    const exact = await this.identities.findOne({
      where: { provider: r.provider, provider_uid: r.providerUid },
    });

    if (exact) {
      // Late unionid: this openid sits on one account but its unionid points at
      // another — silent-merge the no-asset side (微信迟到归并).
      let survivor = exact.user_id;
      if (unionUserId && unionUserId !== exact.user_id) {
        survivor = await this.merge.trySilentMerge(unionUserId, exact.user_id);
      }
      // A successful login proves ownership — promote a backfilled/unverified row.
      await this.identities.update(
        { id: exact.id },
        { last_authenticated_at: new Date(), verified_at: exact.verified_at ?? new Date() },
      );
      return survivor;
    }

    // 3. New identity. Reuse the union-matched user, else create one. (Tx for atomicity.)
    return this.ds.transaction(async (em) => {
      const userId = unionUserId ?? (await this.createUser(em, r.displayName ?? '新用户', r.avatarUrl ?? null));
      const idn = em.create(AuthIdentity, {
        user_id: userId,
        provider: r.provider,
        provider_uid: r.providerUid,
        union_key: r.unionKey ?? null,
        app_id: r.appId ?? null,
        openid: r.openid ?? null,
        verified_at: new Date(),
        raw_profile: r.rawProfile ?? {},
        last_authenticated_at: new Date(),
      });
      await em.save(idn);
      await em.query(
        `UPDATE canvas.users SET primary_identity_id = $1 WHERE id = $2 AND primary_identity_id IS NULL`,
        [idn.id, userId],
      );
      return userId;
    });
  }

  /** Email + password registration. Fails if the email is already an identity. */
  async registerWithPassword(email: string, password: string, displayName: string): Promise<string> {
    const norm = normalizeEmail(email);
    const taken = await this.identities.findOne({ where: { provider: 'email', provider_uid: norm } });
    if (taken) throw new ConflictException({ code: 'CONFLICT', message: 'email already registered' });
    const hash = await this.passwords.hash(password);
    return this.ds.transaction((em) => this.createPasswordUser(em, norm, hash, displayName));
  }

  hashPassword(password: string): Promise<string> {
    return this.passwords.hash(password);
  }

  /** Transaction-aware primitive used by the one-time instance setup flow. */
  async createPasswordUser(
    em: EntityManager,
    normalizedEmail: string,
    passwordHash: string,
    displayName: string,
  ): Promise<string> {
    const taken = await em.findOne(AuthIdentity, {
      where: [
        { provider: 'email', provider_uid: normalizedEmail },
        { provider: 'password', provider_uid: normalizedEmail },
      ],
    });
    if (taken) throw new ConflictException({ code: 'CONFLICT', message: 'email already registered' });
    const userId = await this.createUser(em, displayName, null);
    const emailId = em.create(AuthIdentity, {
      user_id: userId,
      provider: 'email',
      provider_uid: normalizedEmail,
      verified_at: new Date(),
    });
    await em.save(emailId);
    await em.save(
      em.create(AuthIdentity, {
        user_id: userId,
        provider: 'password',
        provider_uid: normalizedEmail,
        secret_hash: passwordHash,
        verified_at: new Date(),
      }),
    );
    await em.update(User, { id: userId }, { primary_identity_id: emailId.id });
    return userId;
  }

  /** Verify an email+password login. Returns the user id, or null if invalid. */
  async verifyPassword(email: string, password: string): Promise<string | null> {
    const norm = normalizeEmail(email);
    const pw = await this.identities.findOne({ where: { provider: 'password', provider_uid: norm } });
    if (!pw?.secret_hash || !(await this.passwords.verify(password, pw.secret_hash))) return null;
    return pw.user_id;
  }

  /** The user's email (from their email identity) — drives role resolution. */
  async emailForUser(userId: string): Promise<string | null> {
    const e = await this.identities.findOne({ where: { user_id: userId, provider: 'email' } });
    return e?.provider_uid ?? null;
  }

  /** Which user owns a given (provider, provider_uid), if any. */
  async findUserByIdentity(provider: string, providerUid: string): Promise<string | null> {
    const i = await this.identities.findOne({ where: { provider, provider_uid: providerUid } });
    return i?.user_id ?? null;
  }

  /** Bound login methods for the personal center (no secrets). */
  async listForUser(userId: string): Promise<IdentityView[]> {
    const rows = await this.identities.find({ where: { user_id: userId }, order: { created_at: 'ASC' } });
    const user = await this.users.findOne({ where: { id: userId } });
    return rows.map((i) => ({
      id: i.id,
      provider: i.provider,
      label: identityLabel(i),
      verified: i.verified_at != null,
      is_primary: user?.primary_identity_id === i.id,
      created_at: i.created_at,
    }));
  }

  /** Link an OAuth/verified identity to a user. 409 if it belongs to someone else. */
  async bindResolved(userId: string, r: ResolvedIdentity): Promise<string> {
    const existing = await this.identities.findOne({
      where: { provider: r.provider, provider_uid: r.providerUid },
    });
    if (existing) {
      if (existing.user_id === userId) return existing.id; // already mine
      throw new ConflictException({
        code: 'IDENTITY_ALREADY_BOUND',
        message: '该登录方式已绑定到其他账户',
      });
    }
    const idn = this.identities.create({
      user_id: userId,
      provider: r.provider,
      provider_uid: r.providerUid,
      union_key: r.unionKey ?? null,
      app_id: r.appId ?? null,
      openid: r.openid ?? null,
      verified_at: new Date(),
      raw_profile: r.rawProfile ?? {},
    });
    await this.identities.save(idn);
    return idn.id;
  }

  /** Bind a code-verified email/phone to a user. */
  bindVerifiedContact(userId: string, channel: 'email' | 'phone', target: string): Promise<string> {
    const uid = channel === 'email' ? normalizeEmail(target) : normalizePhone(target);
    return this.bindResolved(userId, { provider: channel, providerUid: uid });
  }

  /** Unbind an identity. Refuses if it would leave zero usable login methods. */
  async unbind(userId: string, identityId: string): Promise<void> {
    const all = await this.identities.find({ where: { user_id: userId } });
    const target = all.find((i) => i.id === identityId);
    if (!target) throw new NotFoundException({ code: 'NOT_FOUND', message: 'identity not found' });
    if (loginMethodCount(all, identityId) < 1) {
      throw new ConflictException({ code: 'LAST_LOGIN_IDENTITY', message: '这是唯一的登录方式，无法解绑' });
    }
    await this.identities.delete({ id: identityId });
    // Repoint the profile pointer if we just removed it.
    await this.users.query(
      `UPDATE canvas.users SET primary_identity_id =
         (SELECT id FROM canvas.auth_identities WHERE user_id = $1 ORDER BY created_at LIMIT 1)
       WHERE id = $1 AND primary_identity_id = $2`,
      [userId, identityId],
    );
  }

  private async createUser(
    em: EntityManager,
    displayName: string,
    avatarUrl: string | null,
  ): Promise<string> {
    const user = em.create(User, { display_name: displayName, avatar_url: avatarUrl, status: 'active' });
    await em.save(user);
    const ws = em.create(Workspace, { name: `${displayName} 的空间`, owner_id: user.id });
    await em.save(ws);
    await em.save(em.create(WorkspaceMember, { workspace_id: ws.id, user_id: user.id, role: 'owner' }));
    return user.id;
  }
}
