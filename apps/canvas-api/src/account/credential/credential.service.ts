import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isCatalogCurrentLifecycle } from '@xgcanvas/model-catalog';
import { IsNull, Repository } from 'typeorm';
import { RegistryBootstrapService, RegistryService } from '../registry';
import { CreateCredentialDto } from './create-credential.dto';
import { assertCredentialContract } from './credential-contract';
import { ModelCredential } from './credential.entity';
import { presentCredential } from './credential.presenter';
import {
  CredentialVendorStatusService,
  type ProviderStatus,
} from './credential-vendor-status.service';
import { EncryptionService } from './encryption.service';
import { ProviderCatalogWritesService } from './provider-catalog-writes.service';
import { UpdateCredentialDto } from './update-credential.dto';

export type { ProviderStatus, ProviderStatusItem } from './credential-vendor-status.service';

export interface CredentialView {
  id: string;
  channel_resource_uid: string;
  label: string | null;
  credential_type: 'api_key' | 'cli_session';
  payload_fields: string[];
  enabled: boolean;
  is_valid: boolean;
  last_validated_at: Date | null;
  validation_error: string | null;
  expires_at: Date | null;
  last_used_at: Date | null;
  total_usage_count: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class CredentialService {
  constructor(
    @InjectRepository(ModelCredential)
    private readonly credentialRepo: Repository<ModelCredential>,
    private readonly registry: RegistryService,
    private readonly registryBootstrap: RegistryBootstrapService,
    private readonly encryptionService: EncryptionService,
    private readonly vendorStatus: CredentialVendorStatusService,
    private readonly catalogWrites: ProviderCatalogWritesService,
  ) {}

  async create(channelResourceUid: string, dto: CreateCredentialDto): Promise<CredentialView> {
    const credentials = dto.credentials ?? {};
    const credential = await this.registryBootstrap.mutateLocal(async (manager) => {
      const { provider } = await this.catalogWrites.requireCredentialOwnerInTransaction(
        manager,
        channelResourceUid,
      );
      assertCredentialContract(provider.document.auth_method, dto.credential_type, credentials);
      const { encrypted, keyId } = await this.encryptionService.encrypt(credentials);
      const repo = manager.getRepository(ModelCredential);
      return repo.save(
        repo.create({
          channel_resource_uid: channelResourceUid,
          label: dto.label,
          credential_type: dto.credential_type,
          encrypted_payload: encrypted,
          encryption_key_id: keyId,
          payload_fields: Object.keys(credentials),
          enabled: dto.enabled ?? true,
          expires_at: dto.expires_at ? new Date(dto.expires_at) : undefined,
        }),
      );
    });
    return presentCredential(credential);
  }

  async findAllByChannel(channelResourceUid: string): Promise<CredentialView[]> {
    const credentials = await this.credentialRepo.find({
      where: { channel_resource_uid: channelResourceUid, archived_at: IsNull() },
      order: { created_at: 'DESC' },
    });
    return credentials.map(presentCredential);
  }

  async findOne(id: string): Promise<CredentialView> {
    return presentCredential(await this.requireCredential(id));
  }

  async update(id: string, dto: UpdateCredentialDto): Promise<CredentialView> {
    const credential = await this.registryBootstrap.mutateLocal(async (manager) => {
      const repo = manager.getRepository(ModelCredential);
      const row = await repo.findOneBy({ id, archived_at: IsNull() });
      if (!row) throw new NotFoundException(`Credential ${id} not found`);
      const { provider } = await this.catalogWrites.requireCredentialOwnerInTransaction(
        manager,
        row.channel_resource_uid,
      );
      const replacement = dto.credentials
        ? dto.credentials
        : dto.enabled === true
          ? await this.encryptionService.decrypt(row.encrypted_payload)
          : null;
      if (replacement) {
        assertCredentialContract(provider.document.auth_method, row.credential_type, replacement);
      }
      const encrypted = dto.credentials
        ? await this.encryptionService.encrypt(dto.credentials)
        : null;
      if (encrypted && dto.credentials) {
        row.encrypted_payload = encrypted.encrypted;
        row.encryption_key_id = encrypted.keyId;
        row.payload_fields = Object.keys(dto.credentials);
      }
      if (dto.label !== undefined) row.label = dto.label;
      if (dto.enabled !== undefined) row.enabled = dto.enabled;
      if (dto.expires_at !== undefined) row.expires_at = new Date(dto.expires_at);
      return repo.save(row);
    });
    return presentCredential(credential);
  }

  async remove(id: string): Promise<void> {
    await this.registryBootstrap.mutateLocal(async (manager) => {
      const repo = manager.getRepository(ModelCredential);
      const credential = await repo.findOneBy({ id, archived_at: IsNull() });
      if (!credential) throw new NotFoundException(`Credential ${id} not found`);
      credential.enabled = false;
      credential.archived_at = new Date();
      await repo.save(credential);
    });
  }

  async validate(id: string): Promise<CredentialView> {
    const credential = await this.requireCredential(id);
    let valid = false;
    let error: string | undefined;
    try {
      if (this.isDreaminaCredential(credential)) {
        const status = await this.vendorStatus.validateDreamina();
        valid = status.ok;
        error = status.message;
      } else {
        const payload = await this.encryptionService.decrypt(credential.encrypted_payload);
        const apiKey = typeof payload.api_key === 'string' ? payload.api_key : undefined;
        if (!apiKey) valid = true;
        else {
          const base = this.resolveBaseUrl(credential.channel_resource_uid);
          if (!base) error = 'Unable to resolve provider base_url';
          else {
            const response = await this.vendorStatus.pingModels(base, apiKey);
            valid = response.ok;
            if (!response.ok) {
              error = response.status
                ? `Vendor returned ${response.status}${response.message ? `: ${response.message}` : ''}`
                : response.message;
            }
          }
        }
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    const validatedAt = new Date();
    const result = await this.credentialRepo.update(
      {
        id: credential.id,
        channel_resource_uid: credential.channel_resource_uid,
        credential_type: credential.credential_type,
        encrypted_payload: credential.encrypted_payload,
        encryption_key_id: credential.encryption_key_id,
        archived_at: IsNull(),
      },
      {
        is_valid: valid,
        validation_error: error ?? null,
        last_validated_at: validatedAt,
      },
    );
    if (result.affected !== 1) {
      const current = await this.credentialRepo.findOneBy({ id, archived_at: IsNull() });
      if (!current) throw new NotFoundException(`Credential ${id} not found`);
      throw new ConflictException(`Credential ${id} changed while validation was running; retry`);
    }
    return presentCredential(await this.requireCredential(id));
  }

  async providerStatus(providerResourceUid: string): Promise<ProviderStatus> {
    const provider = this.registry.getProvider(providerResourceUid);
    if (!provider) throw new NotFoundException(`Provider ${providerResourceUid} not found`);
    if (provider.document.slug === 'dreamina' || provider.document.auth_method === 'cli_login') {
      return this.vendorStatus.fetchDreaminaStatus();
    }
    const context = await this.resolveProviderApiContext(providerResourceUid);
    if (!context) return { items: [], note: 'No available api_key credential' };
    return this.vendorStatus.fetchBalance(context.base, context.apiKey);
  }

  async credentialBalance(id: string): Promise<ProviderStatus> {
    const credential = await this.requireCredential(id);
    try {
      if (this.isDreaminaCredential(credential)) return this.vendorStatus.fetchDreaminaStatus();
      const payload = await this.encryptionService.decrypt(credential.encrypted_payload);
      const apiKey = typeof payload.api_key === 'string' ? payload.api_key : undefined;
      if (!apiKey) return { items: [], note: '暂无可查询的账户状态' };
      const base = this.resolveBaseUrl(credential.channel_resource_uid);
      if (!base) return { items: [], note: '无法解析 base_url' };
      return this.vendorStatus.fetchBalance(base, apiKey);
    } catch (error) {
      return { items: [], note: (error as Error).message };
    }
  }

  async resolveProviderApiContext(
    providerResourceUid: string,
    allowedChannelUids?: readonly string[],
  ): Promise<{ base: string; apiKey: string } | null> {
    const provider = this.registry.getProvider(providerResourceUid);
    if (!provider) throw new NotFoundException(`Provider ${providerResourceUid} not found`);
    const allowed = allowedChannelUids ? new Set(allowedChannelUids) : null;
    const channels = [...this.registry.getSnapshot().channelsByResourceUid.values()]
      .filter(
        (channel) =>
          channel.document.provider_uid === providerResourceUid &&
          channel.enabled &&
          isCatalogCurrentLifecycle(channel.document.lifecycle) &&
          (!allowed || allowed.has(channel.document.resource_uid)),
      )
      .sort((a, b) => a.priority - b.priority);
    for (const channel of channels) {
      const credentials = await this.credentialRepo.find({
        where: {
          channel_resource_uid: channel.document.resource_uid,
          enabled: true,
          archived_at: IsNull(),
        },
        order: { created_at: 'ASC' },
      });
      for (const credential of credentials) {
        try {
          const payload = await this.encryptionService.decrypt(credential.encrypted_payload);
          const apiKey = typeof payload.api_key === 'string' ? payload.api_key : undefined;
          const base = this.resolveBaseUrl(channel.document.resource_uid);
          if (apiKey && base) return { base, apiKey };
        } catch {
          // Try the next enabled credential.
        }
      }
    }
    return null;
  }

  async getProviderSlugsWithCredentials(): Promise<Set<string>> {
    const values = [...this.registry.getSnapshot().providersByResourceUid.values()].filter(
      (provider) =>
        provider.enabled &&
        [...this.registry.getSnapshot().channelsByResourceUid.values()].some(
          (channel) =>
            channel.document.provider_uid === provider.document.resource_uid &&
            channel.enabled &&
            channel.enabled_credential_ids.length > 0,
        ),
    );
    return new Set(values.map((provider) => provider.document.slug));
  }

  async getDecrypted(id: string): Promise<Record<string, unknown>> {
    const credential = await this.requireCredential(id);
    return (await this.encryptionService.decrypt(credential.encrypted_payload)) ?? {};
  }

  private isDreaminaCredential(credential: ModelCredential): boolean {
    if (credential.credential_type === 'cli_session') return true;
    const channel = this.registry.getChannel(credential.channel_resource_uid);
    const provider = channel ? this.registry.getProvider(channel.document.provider_uid) : null;
    return provider?.document.slug === 'dreamina' || provider?.document.auth_method === 'cli_login';
  }

  private resolveBaseUrl(channelResourceUid: string): string | null {
    const channel = this.registry.getChannel(channelResourceUid);
    if (!channel) return null;
    const provider = this.registry.getProvider(channel.document.provider_uid);
    return (
      stringValue(channel.config_overrides.base_url) ??
      channel.document.base_url ??
      stringValue(provider?.config_overrides.base_url) ??
      provider?.document.base_url ??
      null
    );
  }

  private async requireCredential(id: string): Promise<ModelCredential> {
    const credential = await this.credentialRepo.findOneBy({ id, archived_at: IsNull() });
    if (!credential) throw new NotFoundException(`Credential ${id} not found`);
    return credential;
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
