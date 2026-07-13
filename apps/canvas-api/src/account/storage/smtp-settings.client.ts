import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import nodemailer from 'nodemailer';
import { Repository } from 'typeorm';

import { EncryptionService } from '../credential/encryption.service';
import type { UpdateSmtpSettingsDto } from './smtp-settings.dto';
import { SystemSetting } from './system-setting.entity';

const SETTING_KEY = 'smtp';

interface PublicSmtp {
  host: string;
  port: number;
  secure: boolean;
  from: string;
  verified_at?: string | null;
}

interface SecretSmtp {
  user: string;
  pass: string;
}

export interface SmtpRuntimeConfig {
  host: string;
  port: number;
  secure: boolean;
  from: string;
  user: string;
  pass: string;
}

@Injectable()
export class SmtpSettingsClient {
  constructor(
    @InjectRepository(SystemSetting) private readonly repo: Repository<SystemSetting>,
    private readonly encryption: EncryptionService,
  ) {}

  async getSettingsView() {
    const row = await this.repo.findOne({ where: { key: SETTING_KEY } });
    const config = (row?.public_config ?? {}) as Partial<PublicSmtp>;
    const configured =
      !!row?.encrypted_payload && !!config.host && !!config.from;
    return {
      configured,
      verified: configured && !!config.verified_at,
      verified_at: config.verified_at ?? null,
      host: config.host,
      port: config.port ?? 465,
      secure: config.secure ?? (config.port ?? 465) === 465,
      from: config.from,
      has_user: !!row?.encrypted_payload,
      has_pass: !!row?.encrypted_payload,
    };
  }

  async updateSettings(dto: UpdateSmtpSettingsDto) {
    return this.persistSettings(dto, null);
  }

  async testSettings(dto: UpdateSmtpSettingsDto) {
    const runtime = await this.resolveRuntime(dto);
    const transporter = nodemailer.createTransport({
      host: runtime.host,
      port: runtime.port,
      secure: runtime.secure,
      auth: { user: runtime.user, pass: runtime.pass },
    });
    await transporter.verify();
    return this.persistSettings(dto, new Date().toISOString());
  }

  async readinessStatus(): Promise<'ready' | 'missing' | 'unverified'> {
    const view = await this.getSettingsView();
    if (!view.configured) return 'missing';
    return view.verified ? 'ready' : 'unverified';
  }

  /** Active SMTP for sending: DB row if present, else null (caller may fall back to env). */
  async getRuntimeConfig(): Promise<SmtpRuntimeConfig | null> {
    const row = await this.repo.findOne({ where: { key: SETTING_KEY } });
    if (!row?.encrypted_payload) return null;
    const config = row.public_config as unknown as PublicSmtp;
    if (!config.host || !config.from) return null;
    const secrets = (await this.encryption.decrypt(row.encrypted_payload)) as unknown as SecretSmtp;
    if (!secrets.user || !secrets.pass) return null;
    return {
      host: config.host,
      port: config.port ?? 465,
      secure: config.secure ?? (config.port ?? 465) === 465,
      from: config.from,
      user: secrets.user,
      pass: secrets.pass,
    };
  }

  private async persistSettings(dto: UpdateSmtpSettingsDto, verifiedAt: string | null) {
    const previous = await this.readSecrets();
    const user = dto.user?.trim() || previous?.user;
    const pass = dto.pass?.trim() || previous?.pass;
    if (!user || !pass) {
      throw new BadRequestException('SMTP user and pass are required for initial setup');
    }
    const publicConfig = normalisePublic(dto, verifiedAt);
    const encrypted = await this.encryption.encrypt({ user, pass });
    await this.repo.save(
      this.repo.create({
        key: SETTING_KEY,
        public_config: { ...publicConfig },
        encrypted_payload: encrypted.encrypted,
        encryption_key_id: encrypted.keyId,
      }),
    );
    return this.getSettingsView();
  }

  private async resolveRuntime(dto: UpdateSmtpSettingsDto): Promise<SmtpRuntimeConfig> {
    const previous = await this.readSecrets();
    const user = dto.user?.trim() || previous?.user || '';
    const pass = dto.pass?.trim() || previous?.pass || '';
    if (!user || !pass) {
      throw new BadRequestException('SMTP user and pass are required');
    }
    const pub = normalisePublic(dto, null);
    return { ...pub, user, pass };
  }

  private async readSecrets(): Promise<SecretSmtp | null> {
    const row = await this.repo.findOne({ where: { key: SETTING_KEY } });
    if (!row?.encrypted_payload) return null;
    return (await this.encryption.decrypt(row.encrypted_payload)) as unknown as SecretSmtp;
  }
}

function normalisePublic(dto: UpdateSmtpSettingsDto, verifiedAt: string | null): PublicSmtp {
  const port = dto.port ?? 465;
  return {
    host: dto.host.trim(),
    port,
    secure: dto.secure ?? port === 465,
    from: dto.from.trim(),
    verified_at: verifiedAt,
  };
}
