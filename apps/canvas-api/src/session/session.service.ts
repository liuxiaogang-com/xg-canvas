import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';

import { AuthDevice, AuthSession } from '../database/entities';
import { RedisService } from '../redis/redis.service';
import { Keys } from '../redis/keys';
import { sessionTtlMs } from './session-lifetime';
import { genOpaqueToken, sha256, toHex } from './session.tokens';

export interface IssueContext {
  user: { id: string; email: string | null };
  workspaceId: string;
  createdVia: string; // password | wechat | feishu | phone | email
  clientDeviceId?: string | null;
  deviceLabel?: string | null;
  platform?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  remember?: boolean;
}

/** Cached liveness payload — enough to rebuild AuthUser without a DB hit. */
export interface SessionCache {
  sid: string;
  user_id: string;
  workspace_id: string;
  email: string | null;
  device_id: string;
  expires_at: number; // epoch ms
}

export interface SessionDeviceView {
  id: string;
  device_label: string | null;
  platform: string | null;
  user_agent: string | null;
  last_ip: string | null;
  created_via: string | null;
  last_seen_at: Date;
  created_at: Date;
  is_current: boolean;
}

// Atomic kick: tombstone first (so a concurrent cache-miss that re-checks DB
// already sees revoked), then drop the positive cache + accel-set member.
const KICK_LUA = `
redis.call('SET', KEYS[1], '1', 'EX', tonumber(ARGV[1]))
redis.call('DEL', KEYS[2])
redis.call('SREM', KEYS[3], ARGV[2])
return 1`;

@Injectable()
export class SessionService {
  private readonly maxDevices: number;
  private readonly ttlMs: number;
  private readonly cacheTtlSec: number;

  constructor(
    @InjectRepository(AuthSession) private readonly sessions: Repository<AuthSession>,
    @InjectRepository(AuthDevice) private readonly devices: Repository<AuthDevice>,
    private readonly ds: DataSource,
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.maxDevices = Number(config.get('SESSION_MAX_DEVICES', 10)) || 10;
    this.ttlMs = sessionTtlMs(config.get('SESSION_TTL_DAYS'));
    this.cacheTtlSec = Number(config.get('SESSION_CACHE_TTL_SEC', 1800)) || 1800;
  }

  /** Mint an opaque session (resolve/replace device, enforce device cap, persist, cache). */
  async issue(ctx: IssueContext): Promise<{ token: string; sessionId: string }> {
    const token = genOpaqueToken();
    const hash = sha256(token);
    const expiresAt = new Date(Date.now() + this.ttlMs);
    const evicted: AuthSession[] = [];
    let sessionId = '';
    let deviceId = '';

    await this.ds.transaction(async (em) => {
      const device = await this.resolveDevice(em, ctx, evicted);
      deviceId = device.id;

      // Device cap (LRU): a fresh login must leave room for itself.
      const active = await em.find(AuthSession, {
        where: { user_id: ctx.user.id, status: 'active' },
        order: { last_seen_at: 'ASC' },
      });
      const overflow = active.length + 1 - this.maxDevices;
      for (let i = 0; i < overflow && i < active.length; i++) {
        const victim = active[i];
        victim.status = 'revoked';
        victim.revoked_at = new Date();
        victim.revoked_reason = 'device_limit_lru';
        await em.save(victim);
        evicted.push(victim);
      }

      const session = em.create(AuthSession, {
        user_id: ctx.user.id,
        device_id: device.id,
        workspace_id: ctx.workspaceId,
        token_hash: hash,
        status: 'active',
        email: ctx.user.email ?? null,
        created_via: ctx.createdVia,
        remember: ctx.remember ?? false,
        expires_at: expiresAt,
      });
      await em.save(session);
      sessionId = session.id;
    });

    await this.writeLive(hash, {
      sid: sessionId,
      user_id: ctx.user.id,
      workspace_id: ctx.workspaceId,
      email: ctx.user.email ?? null,
      device_id: deviceId,
      expires_at: expiresAt.getTime(),
    });
    for (const v of evicted) await this.tombstone(v);
    return { token, sessionId };
  }

  /** Per-request liveness check. Redis first (MGET revoked+live), DB fallback. */
  async validate(token: string): Promise<SessionCache | null> {
    const hash = sha256(token);
    const hex = toHex(hash);
    const r = this.redis.raw();
    const [revoked, live] = await r.mget(Keys.session.revoked(hex), Keys.session.live(hex));
    if (revoked) return null;
    if (live) {
      const cache = JSON.parse(live) as SessionCache;
      return cache.expires_at > Date.now() ? cache : null;
    }
    // Cache miss: DB is the source of truth.
    const row = await this.sessions.findOne({ where: { token_hash: hash, status: 'active' } });
    if (!row || row.expires_at.getTime() <= Date.now()) return null;
    const cache: SessionCache = {
      sid: row.id,
      user_id: row.user_id,
      workspace_id: row.workspace_id,
      email: row.email,
      device_id: row.device_id,
      expires_at: row.expires_at.getTime(),
    };
    await this.writeLive(hash, cache);
    void this.touch(row).catch(() => undefined);
    return cache;
  }

  /** Revoke one session (caller must own it). Instant via tombstone. */
  async revoke(sessionId: string, callerUserId: string, reason: string): Promise<void> {
    const row = await this.sessions.findOne({ where: { id: sessionId } });
    if (!row || row.user_id !== callerUserId) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'session not found' });
    }
    if (row.status !== 'active') return;
    await this.sessions.update(
      { id: sessionId },
      { status: 'revoked', revoked_at: new Date(), revoked_reason: reason },
    );
    await this.tombstone(row);
  }

  /** Revoke every active session of a user (password change / role change / merge). */
  async revokeAllForUser(userId: string, reason: string): Promise<void> {
    const rows = await this.sessions.find({ where: { user_id: userId, status: 'active' } });
    if (!rows.length) return;
    await this.sessions.update(
      { user_id: userId, status: 'active' },
      { status: 'revoked', revoked_at: new Date(), revoked_reason: reason },
    );
    for (const row of rows) await this.tombstone(row);
  }

  /** Revoke the session a presented token belongs to (logout, best-effort). */
  async revokeByToken(token: string, reason: string): Promise<void> {
    const hash = sha256(token);
    const row = await this.sessions.findOne({ where: { token_hash: hash, status: 'active' } });
    if (!row) return;
    await this.sessions.update(
      { id: row.id },
      { status: 'revoked', revoked_at: new Date(), revoked_reason: reason },
    );
    await this.tombstone(row);
  }

  /** Sliding renewal: if the token's session is live, extend its absolute expiry. */
  async refresh(token: string): Promise<boolean> {
    const cache = await this.validate(token);
    if (!cache) return false;
    const hash = sha256(token);
    const newExpiry = new Date(Date.now() + this.ttlMs);
    await this.sessions.update({ id: cache.sid }, { expires_at: newExpiry, last_seen_at: new Date() });
    await this.writeLive(hash, { ...cache, expires_at: newExpiry.getTime() });
    return true;
  }

  /** Active sessions/devices for the personal-center list. */
  async list(userId: string, currentSessionId: string): Promise<SessionDeviceView[]> {
    const sessions = await this.sessions.find({
      where: { user_id: userId, status: 'active' },
      order: { last_seen_at: 'DESC' },
    });
    const deviceIds = [...new Set(sessions.map((s) => s.device_id))];
    const devices = deviceIds.length ? await this.devices.find({ where: { id: In(deviceIds) } }) : [];
    const byId = new Map(devices.map((d) => [d.id, d]));
    return sessions.map((s) => {
      const d = byId.get(s.device_id);
      return {
        id: s.id,
        device_label: d?.device_label ?? null,
        platform: d?.platform ?? null,
        user_agent: d?.user_agent ?? null,
        last_ip: d?.last_ip ?? null,
        created_via: s.created_via,
        last_seen_at: s.last_seen_at,
        created_at: s.created_at,
        is_current: s.id === currentSessionId,
      };
    });
  }

  private async resolveDevice(
    em: DataSource['manager'],
    ctx: IssueContext,
    evicted: AuthSession[],
  ): Promise<AuthDevice> {
    if (ctx.clientDeviceId) {
      const existing = await em.findOne(AuthDevice, {
        where: { user_id: ctx.user.id, client_device_id: ctx.clientDeviceId, revoked_at: IsNull() },
      });
      if (existing) {
        existing.last_seen_at = new Date();
        existing.device_label = ctx.deviceLabel ?? existing.device_label;
        existing.platform = ctx.platform ?? existing.platform;
        existing.user_agent = ctx.userAgent ?? existing.user_agent;
        existing.last_ip = ctx.ip ?? existing.last_ip;
        await em.save(existing);
        // Same device re-login replaces its prior session (no extra slot).
        const prior = await em.find(AuthSession, {
          where: { device_id: existing.id, status: 'active' },
        });
        for (const p of prior) {
          p.status = 'revoked';
          p.revoked_at = new Date();
          p.revoked_reason = 'device_reauth';
          await em.save(p);
          evicted.push(p);
        }
        return existing;
      }
    }
    const device = em.create(AuthDevice, {
      user_id: ctx.user.id,
      client_device_id: ctx.clientDeviceId ?? null,
      device_label: ctx.deviceLabel ?? null,
      platform: ctx.platform ?? null,
      user_agent: ctx.userAgent ?? null,
      last_ip: ctx.ip ?? null,
    });
    await em.save(device);
    return device;
  }

  private async writeLive(hash: Buffer, cache: SessionCache): Promise<void> {
    const ttl = Math.min(this.cacheTtlSec, Math.max(1, Math.ceil((cache.expires_at - Date.now()) / 1000)));
    const hex = toHex(hash);
    await this.redis.raw().set(Keys.session.live(hex), JSON.stringify(cache), 'EX', ttl);
    await this.redis.raw().sadd(Keys.session.userSet(cache.user_id), hex);
  }

  private async tombstone(row: AuthSession): Promise<void> {
    const hex = toHex(row.token_hash);
    const ttl = Math.max(1, Math.ceil((row.expires_at.getTime() - Date.now()) / 1000));
    await this.redis
      .raw()
      .eval(
        KICK_LUA,
        3,
        Keys.session.revoked(hex),
        Keys.session.live(hex),
        Keys.session.userSet(row.user_id),
        String(ttl),
        hex,
      );
  }

  private async touch(row: AuthSession): Promise<void> {
    const now = new Date();
    await this.sessions.update({ id: row.id }, { last_seen_at: now });
    await this.devices.update({ id: row.device_id }, { last_seen_at: now });
  }
}
