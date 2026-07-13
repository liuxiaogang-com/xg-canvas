import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { IsNull, LessThan, MoreThan, Repository } from 'typeorm';

import { VerificationChallenge } from '../database/entities';
import { EmailSenderService } from './email-sender.service';
import { normalizeEmail, normalizePhone } from './normalize';

export type Channel = 'email' | 'phone';
export type Purpose = 'login' | 'bind' | 'merge_confirm';

const CODE_TTL_MS = 10 * 60_000;
const MAGIC_TTL_MS = 30 * 60_000;
const MAX_ATTEMPTS = 5;

function sha256hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * Email/SMS codes + magic-link tokens. Email delivery uses SMTP when configured;
 * in non-production the send response also carries `devCode`/`devToken` so the
 * whole flow stays testable without an email/SMS provider.
 */
@Injectable()
export class VerificationService {
  private readonly logger = new Logger('Verification');
  private readonly devReveal: boolean;
  private readonly requireEmailDelivery: boolean;
  private readonly publicBaseUrl: string;

  constructor(
    @InjectRepository(VerificationChallenge) private readonly challenges: Repository<VerificationChallenge>,
    private readonly emailSender: EmailSenderService,
    config: ConfigService,
  ) {
    this.devReveal = config.get<string>('NODE_ENV') !== 'production';
    this.requireEmailDelivery =
      config.get<string>('NODE_ENV') === 'production' || this.flag(config, 'EMAIL_DELIVERY_REQUIRED', false);
    this.publicBaseUrl = config.get<string>('PUBLIC_BASE_URL')?.trim() ?? '';
  }

  private norm(channel: Channel, target: string): string {
    return channel === 'email' ? normalizeEmail(target) : normalizePhone(target);
  }

  /** Issue a 6-digit code, rate-limited per target. Returns devCode in non-prod. */
  async sendCode(
    channel: Channel,
    target: string,
    purpose: Purpose,
    userId?: string | null,
  ): Promise<{ sent: true; devCode?: string }> {
    const norm = this.norm(channel, target);
    const recent = await this.challenges.count({
      where: { channel, target: norm, purpose, created_at: MoreThan(new Date(Date.now() - 60_000)) },
    });
    if (recent >= 3) throw new BadRequestException({ code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' });
    const code = String(randomInt(100000, 1000000));
    await this.challenges.save(
      this.challenges.create({
        channel,
        target: norm,
        purpose,
        code_hash: sha256hex(code),
        user_id: userId ?? null,
        expires_at: new Date(Date.now() + CODE_TTL_MS),
      }),
    );
    this.logger.log(
      this.devReveal
        ? `[${channel}] ${purpose} code for ${norm}: ${code}`
        : `[${channel}] ${purpose} code issued for ${norm}`,
    );
    if (channel === 'email') {
      const sent = await this.deliverEmailCode(norm, code, purpose);
      if (!sent && this.requireEmailDelivery) this.throwEmailDeliveryDisabled();
    }
    return this.devReveal ? { sent: true, devCode: code } : { sent: true };
  }

  /** Validate a code (one-time, attempt-limited). Returns the bound user_id if any. */
  async verifyCode(
    channel: Channel,
    target: string,
    purpose: Purpose,
    code: string,
  ): Promise<{ ok: boolean; userId?: string | null }> {
    const norm = this.norm(channel, target);
    const ch = await this.challenges.findOne({
      where: { channel, target: norm, purpose, consumed_at: IsNull() },
      order: { created_at: 'DESC' },
    });
    if (!ch || ch.expires_at.getTime() < Date.now() || ch.attempt_count >= MAX_ATTEMPTS) return { ok: false };
    if (ch.code_hash !== sha256hex(code)) {
      await this.challenges.increment(
        { id: ch.id, consumed_at: IsNull(), attempt_count: LessThan(MAX_ATTEMPTS) },
        'attempt_count',
        1,
      );
      return { ok: false };
    }
    const consumed = await this.challenges.update(
      {
        id: ch.id,
        code_hash: ch.code_hash,
        consumed_at: IsNull(),
        expires_at: MoreThan(new Date()),
        attempt_count: LessThan(MAX_ATTEMPTS),
      },
      { consumed_at: new Date() },
    );
    return consumed.affected === 1 ? { ok: true, userId: ch.user_id } : { ok: false };
  }

  /** Create a one-time magic-link token for an email. Returns devToken in non-prod. */
  async createMagicLink(
    email: string,
    purpose: Purpose = 'login',
    userId?: string | null,
  ): Promise<{ sent: true; devToken?: string }> {
    const norm = normalizeEmail(email);
    const token = randomBytes(32).toString('base64url');
    const link = this.magicLink(token);
    await this.challenges.save(
      this.challenges.create({
        channel: 'email',
        target: norm,
        purpose,
        token_hash: sha256hex(token),
        user_id: userId ?? null,
        expires_at: new Date(Date.now() + MAGIC_TTL_MS),
      }),
    );
    this.logger.log(this.devReveal ? `magic-link token for ${norm}: ${token}` : `magic-link issued for ${norm}`);
    const sent = await this.deliverMagicLink(norm, link);
    if (!sent && this.requireEmailDelivery) this.throwEmailDeliveryDisabled();
    return this.devReveal ? { sent: true, devToken: token } : { sent: true };
  }

  async consumeMagic(token: string): Promise<{ target: string; userId: string | null } | null> {
    const ch = await this.challenges.findOne({
      where: { token_hash: sha256hex(token), consumed_at: IsNull() },
      order: { created_at: 'DESC' },
    });
    if (!ch?.token_hash || ch.expires_at.getTime() < Date.now()) return null;
    const consumed = await this.challenges.update(
      {
        id: ch.id,
        token_hash: ch.token_hash,
        consumed_at: IsNull(),
        expires_at: MoreThan(new Date()),
      },
      { consumed_at: new Date() },
    );
    return consumed.affected === 1 ? { target: ch.target, userId: ch.user_id } : null;
  }

  private async deliverEmailCode(target: string, code: string, purpose: Purpose): Promise<boolean> {
    try {
      return await this.emailSender.sendVerificationCode(target, code, purpose);
    } catch (err) {
      this.logger.error(`email code delivery failed for ${target}`, err instanceof Error ? err.stack : undefined);
      throw new ServiceUnavailableException({ code: 'EMAIL_SEND_FAILED', message: '邮件发送失败，请稍后重试' });
    }
  }

  private async deliverMagicLink(target: string, link: string): Promise<boolean> {
    try {
      return await this.emailSender.sendMagicLink(target, link);
    } catch (err) {
      this.logger.error(`magic-link delivery failed for ${target}`, err instanceof Error ? err.stack : undefined);
      throw new ServiceUnavailableException({ code: 'EMAIL_SEND_FAILED', message: '邮件发送失败，请稍后重试' });
    }
  }

  private magicLink(token: string): string {
    if (!this.publicBaseUrl) {
      throw new ServiceUnavailableException({
        code: 'PUBLIC_BASE_URL_REQUIRED',
        message: '启用 Magic Link 前请配置产品外部访问地址',
      });
    }
    return `${this.publicBaseUrl.replace(/\/+$/, '')}/api/v1/auth/magic?token=${encodeURIComponent(token)}`;
  }

  private throwEmailDeliveryDisabled(): never {
    throw new ServiceUnavailableException({ code: 'EMAIL_NOT_CONFIGURED', message: '邮箱发送服务未配置' });
  }

  private flag(config: ConfigService, name: string, fallback: boolean): boolean {
    const value = config.get<string>(name);
    if (value === undefined || value === '') return fallback;
    return value === 'true' || value === '1';
  }
}
