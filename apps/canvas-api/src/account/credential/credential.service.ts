import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ModelChannel } from '../channel/channel.entity';
import { DreaminaCliRunner } from '../dreamina/dreamina-cli.runner';
import { ModelProvider } from '../provider/provider.entity';
import { CreateCredentialDto } from './create-credential.dto';
import { ModelCredential } from './credential.entity';
import { EncryptionService } from './encryption.service';
import { UpdateCredentialDto } from './update-credential.dto';

/** Safe credential shape returned to clients; never contains decrypted values. */
export interface CredentialView {
  id: string;
  channel_id: string;
  label: string | null;
  credential_type: string;
  payload_fields: string[];
  enabled: boolean;
  is_valid: boolean;
  last_validated_at: Date | null;
  validation_error: string | null;
  expires_at: Date | null;
  auto_refresh: boolean;
  last_used_at: Date | null;
  total_usage_count: number;
  source: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProviderStatusItem {
  label: string;
  value: string;
  tone?: 'success' | 'warning' | 'danger' | 'default';
}

/** Neutral account status cell: balance, membership, credits, expiry, etc. */
export interface ProviderStatus {
  items: ProviderStatusItem[];
  available?: boolean;
  note?: string;
}

@Injectable()
export class CredentialService {
  private readonly logger = new Logger(CredentialService.name);

  constructor(
    @InjectRepository(ModelCredential)
    private readonly credentialRepo: Repository<ModelCredential>,
    @InjectRepository(ModelChannel)
    private readonly channelRepo: Repository<ModelChannel>,
    @InjectRepository(ModelProvider)
    private readonly providerRepo: Repository<ModelProvider>,
    private readonly encryptionService: EncryptionService,
    private readonly dreamina: DreaminaCliRunner,
  ) {}

  async create(channelId: string, dto: CreateCredentialDto): Promise<CredentialView> {
    const credentials = dto.credentials ?? {};
    const payloadFields = Object.keys(credentials);
    const { encrypted, keyId } = await this.encryptionService.encrypt(credentials);

    const credential = this.credentialRepo.create({
      channel_id: channelId,
      label: dto.label,
      credential_type: dto.credential_type,
      encrypted_payload: encrypted,
      encryption_key_id: keyId,
      payload_fields: payloadFields,
      enabled: dto.enabled ?? true,
      expires_at: dto.expires_at ? new Date(dto.expires_at) : undefined,
      auto_refresh: dto.auto_refresh ?? false,
      created_by: dto.created_by,
    });

    return this.toView(await this.credentialRepo.save(credential));
  }

  async findAllByChannel(channelId: string): Promise<CredentialView[]> {
    const credentials = await this.credentialRepo.find({
      where: { channel_id: channelId },
      order: { created_at: 'DESC' },
    });
    return credentials.map((c) => this.toView(c));
  }

  async findOne(id: string): Promise<CredentialView> {
    const credential = await this.credentialRepo.findOne({ where: { id } });
    if (!credential) throw new NotFoundException(`Credential ${id} not found`);
    return this.toView(credential);
  }

  async update(id: string, dto: UpdateCredentialDto): Promise<CredentialView> {
    const credential = await this.credentialRepo.findOne({ where: { id } });
    if (!credential) throw new NotFoundException(`Credential ${id} not found`);

    if (dto.credentials) {
      const credentials = dto.credentials ?? {};
      const payloadFields = Object.keys(credentials);
      const { encrypted, keyId } = await this.encryptionService.encrypt(credentials);
      credential.encrypted_payload = encrypted;
      credential.encryption_key_id = keyId;
      credential.payload_fields = payloadFields;
    }

    if (dto.label !== undefined) credential.label = dto.label;
    if (dto.credential_type !== undefined) credential.credential_type = dto.credential_type;
    if (dto.enabled !== undefined) credential.enabled = dto.enabled;
    if (dto.expires_at !== undefined) credential.expires_at = new Date(dto.expires_at);
    if (dto.auto_refresh !== undefined) credential.auto_refresh = dto.auto_refresh;

    return this.toView(await this.credentialRepo.save(credential));
  }

  async remove(id: string): Promise<void> {
    const credential = await this.credentialRepo.findOne({ where: { id } });
    if (!credential) throw new NotFoundException(`Credential ${id} not found`);
    await this.credentialRepo.remove(credential);
  }

  async validate(id: string): Promise<CredentialView> {
    const credential = await this.credentialRepo.findOne({ where: { id } });
    if (!credential) throw new NotFoundException(`Credential ${id} not found`);

    let valid = false;
    let error: string | undefined;
    try {
      if (await this.isDreaminaCredential(credential)) {
        const status = await this.dreamina.credit();
        valid = status.logged_in;
        error = status.logged_in ? undefined : status.error ?? 'Dreamina CLI is not logged in';
      } else {
        const payload = await this.encryptionService.decrypt(credential.encrypted_payload);
        const apiKey = typeof payload.api_key === 'string' ? payload.api_key : undefined;
        if (!apiKey) valid = true;
        else {
          const base = await this.resolveBaseUrl(credential.channel_id);
          if (!base) error = 'Unable to resolve provider base_url';
          else {
            const r = await this.pingModels(base, apiKey);
            valid = r.ok;
            if (!r.ok) error = r.status ? `Vendor returned ${r.status}${r.message ? `: ${r.message}` : ''}` : r.message;
          }
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    credential.is_valid = valid;
    credential.validation_error = (error ?? null) as unknown as string;
    credential.last_validated_at = new Date();
    await this.credentialRepo.save(credential);
    return this.toView(credential);
  }

  async providerStatus(providerId: string): Promise<ProviderStatus> {
    const provider = await this.providerRepo.findOne({ where: { id: providerId } });
    if (!provider) throw new NotFoundException(`Provider ${providerId} not found`);
    if (provider.slug === 'dreamina' || provider.auth_method === 'cli_login') return this.fetchDreaminaStatus();

    const ctx = await this.resolveProviderApiContext(providerId);
    if (!ctx) return { items: [], note: 'No available api_key credential' };
    return this.fetchBalance(ctx.base, ctx.apiKey);
  }

  async credentialBalance(id: string): Promise<ProviderStatus> {
    const credential = await this.credentialRepo.findOne({ where: { id } });
    if (!credential) throw new NotFoundException(`Credential ${id} not found`);
    try {
      if (await this.isDreaminaCredential(credential)) return this.fetchDreaminaStatus();
      const payload = await this.encryptionService.decrypt(credential.encrypted_payload);
      const apiKey = typeof payload.api_key === 'string' ? payload.api_key : undefined;
      if (!apiKey) return { items: [], note: '暂无可查询的账户状态' };
      const base = await this.resolveBaseUrl(credential.channel_id);
      if (!base) return { items: [], note: '无法解析 base_url' };
      return this.fetchBalance(base, apiKey);
    } catch (e) {
      return { items: [], note: (e as Error).message };
    }
  }

  async resolveProviderApiContext(providerId: string): Promise<{ base: string; apiKey: string } | null> {
    const provider = await this.providerRepo.findOne({ where: { id: providerId } });
    if (!provider) throw new NotFoundException(`Provider ${providerId} not found`);
    const channels = await this.channelRepo.find({ where: { provider_id: providerId } });
    for (const ch of channels) {
      const creds = await this.credentialRepo.find({ where: { channel_id: ch.id, enabled: true } });
      for (const cred of creds) {
        try {
          const payload = await this.encryptionService.decrypt(cred.encrypted_payload);
          const apiKey = typeof payload.api_key === 'string' ? payload.api_key : undefined;
          const base = ch.base_url ?? provider.base_url;
          if (apiKey && base) return { base, apiKey };
        } catch {
          // Try next credential.
        }
      }
    }
    return null;
  }

  private async isDreaminaCredential(credential: ModelCredential): Promise<boolean> {
    if (credential.credential_type === 'cli_session') return true;
    const channel = await this.channelRepo.findOne({ where: { id: credential.channel_id } });
    if (!channel) return false;
    const provider = await this.providerRepo.findOne({ where: { id: channel.provider_id } });
    return provider?.slug === 'dreamina' || provider?.auth_method === 'cli_login';
  }

  private async fetchDreaminaStatus(): Promise<ProviderStatus> {
    const credit = await this.dreamina.credit();
    if (!credit.logged_in) {
      return { items: [], available: false, note: credit.error ?? '即梦 CLI 未登录' };
    }
    const items: ProviderStatusItem[] = [
      {
        label: '会员',
        value: credit.vip_level || '未开通',
        tone: credit.vip_level ? 'success' : 'warning',
      },
    ];
    if (typeof credit.total_credit === 'number') {
      items.push({
        label: '积分',
        value: String(credit.total_credit),
        tone: credit.total_credit > 0 ? 'success' : 'warning',
      });
    }
    return { items, available: !!credit.vip_level && (credit.total_credit ?? 0) > 0 };
  }

  private async fetchBalance(base: string, apiKey: string): Promise<ProviderStatus> {
    const url = `${base.replace(/\/$/, '')}/user/balance`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const res = await fetch(url, { headers: { authorization: `Bearer ${apiKey}` }, signal: ctrl.signal });
      if (!res.ok) return { items: [], note: `不支持余额查询(${res.status})` };
      const j = (await res.json()) as {
        is_available?: boolean;
        balance_infos?: { currency: string; total_balance: string }[];
      };
      const items: ProviderStatusItem[] = (j.balance_infos ?? []).map((b) => ({
        label: '余额',
        value: `${b.currency} ${b.total_balance}`,
        tone: Number(b.total_balance) > 0 ? 'success' : 'warning',
      }));
      return { items, available: j.is_available };
    } catch (e) {
      return { items: [], note: (e as Error).message };
    } finally {
      clearTimeout(timer);
    }
  }

  private async resolveBaseUrl(channelId: string): Promise<string | null> {
    const channel = await this.channelRepo.findOne({ where: { id: channelId } });
    if (!channel) return null;
    if (channel.base_url) return channel.base_url;
    const provider = await this.providerRepo.findOne({ where: { id: channel.provider_id } });
    return provider?.base_url ?? null;
  }

  private async pingModels(base: string, apiKey: string): Promise<{ ok: boolean; status?: number; message?: string }> {
    const url = `${base.replace(/\/$/, '')}/models`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const res = await fetch(url, { headers: { authorization: `Bearer ${apiKey}` }, signal: ctrl.signal });
      if (res.ok) return { ok: true, status: res.status };
      let message: string | undefined;
      try {
        const j = (await res.json()) as { error?: { message?: string }; message?: string };
        message = j?.error?.message ?? j?.message;
      } catch {
        // Non-json error body.
      }
      return { ok: false, status: res.status, message };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Return provider slugs that have at least one enabled credential on an
   * enabled channel. This is the single "configured and enabled" availability
   * check used by model lists and feature model resolution; it intentionally
   * does not require a validation probe or expiry check.
   */
  async getProviderSlugsWithCredentials(): Promise<Set<string>> {
    const rows = await this.credentialRepo.manager.query<{ slug: string }[]>(
      `SELECT DISTINCT p.slug FROM account.providers p
       INNER JOIN account.channels ch ON ch.provider_id = p.id AND ch.enabled = TRUE
       INNER JOIN account.credentials c ON c.channel_id = ch.id AND c.enabled = TRUE
       WHERE p.enabled = TRUE`,
    );
    return new Set(rows.map((r) => r.slug));
  }

  /** Internal: get decrypted credential for invocation. */
  async getDecrypted(id: string): Promise<Record<string, any>> {
    const credential = await this.credentialRepo.findOne({ where: { id } });
    if (!credential) throw new NotFoundException(`Credential ${id} not found`);
    const payload = await this.encryptionService.decrypt(credential.encrypted_payload);
    return payload ?? {};
  }

  private toView(credential: ModelCredential): CredentialView {
    return {
      id: credential.id,
      channel_id: credential.channel_id,
      label: credential.label,
      credential_type: credential.credential_type,
      payload_fields: credential.payload_fields,
      enabled: credential.enabled,
      is_valid: credential.is_valid,
      last_validated_at: credential.last_validated_at,
      validation_error: credential.validation_error,
      expires_at: credential.expires_at,
      auto_refresh: credential.auto_refresh,
      last_used_at: credential.last_used_at,
      total_usage_count: credential.total_usage_count,
      source: credential.source,
      created_by: credential.created_by,
      created_at: credential.created_at,
      updated_at: credential.updated_at,
    };
  }
}
