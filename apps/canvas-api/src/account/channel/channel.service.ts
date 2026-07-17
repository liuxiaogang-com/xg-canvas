import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { CatalogChannelTemplate, CatalogProvider } from '@xgcanvas/model-catalog';
import { randomUUID } from 'node:crypto';
import { Repository, type EntityManager } from 'typeorm';
import {
  CatalogLocalWriterService,
  CatalogReadService,
  CatalogResource,
  OutboundRouteSecurityService,
  effectiveOutboundBaseUrl,
  nextConfigOverrides,
  type CatalogRecord,
} from '../catalog';
import { ProviderInstallation } from '../provider/provider-installation.entity';
import { RegistryBootstrapService } from '../registry';
import { ChannelInstallation } from './channel-installation.entity';
import { CreateChannelDto } from './create-channel.dto';
import { UpdateChannelDto } from './update-channel.dto';

const OVERRIDE_FIELDS = new Set([
  'base_url',
  'request_config',
]);

export interface ChannelView extends Omit<CatalogChannelTemplate, 'provider_uid'> {
  provider_resource_uid: string;
  enabled: boolean;
  priority: number;
  origin: CatalogRecord<CatalogChannelTemplate>['origin'];
}

@Injectable()
export class ChannelService {
  constructor(
    @InjectRepository(ChannelInstallation)
    private readonly settingsRepo: Repository<ChannelInstallation>,
    private readonly writer: CatalogLocalWriterService,
    private readonly catalog: CatalogReadService,
    private readonly registry: RegistryBootstrapService,
    private readonly outboundRoutes: OutboundRouteSecurityService,
  ) {}

  async create(providerResourceUid: string, dto: CreateChannelDto): Promise<ChannelView> {
    const resourceUid = randomUUID();
    await this.registry.mutateLocal(async (manager) => {
      const provider = await this.requireProvider(providerResourceUid, manager);
      assertAdapterKeys(provider.document, dto.adapter_keys);
      const current = await this.catalog.listCurrent<CatalogChannelTemplate>(
        'channel_template',
        manager,
      );
      if (
        current.some(
          (record) =>
            record.document.provider_uid === providerResourceUid &&
            record.document.slug === dto.slug,
        )
      )
        throw new ConflictException(`Channel with slug "${dto.slug}" already exists`);
      await this.writer.create(manager, channelDocument(resourceUid, providerResourceUid, dto), {
        settings: { enabled: dto.enabled ?? false, priority: dto.priority ?? 0 },
      });
    });
    return this.findOne(resourceUid);
  }

  async findAllByProvider(providerResourceUid: string): Promise<ChannelView[]> {
    const records = await this.catalog.listCurrent<CatalogChannelTemplate>('channel_template');
    const settings = await this.settingsRepo.find();
    const byUid = new Map(settings.map((row) => [row.channel_resource_uid, row]));
    return records
      .filter(
        (record) =>
          record.document.provider_uid === providerResourceUid &&
          record.document.lifecycle !== 'retired' &&
          record.document.lifecycle !== 'revoked',
      )
      .map((record) => toView(record, requireSettings(byUid, record.document.resource_uid)))
      .sort((a, b) => a.priority - b.priority || a.display_name.localeCompare(b.display_name));
  }

  async findOne(resourceUid: string): Promise<ChannelView> {
    const record = await this.requireRecord(resourceUid);
    const settings = await this.settingsRepo.findOneBy({ channel_resource_uid: resourceUid });
    if (!settings) throw new Error(`channel settings are missing: ${resourceUid}`);
    return toView(record, settings);
  }

  async update(
    resourceUid: string,
    dto: UpdateChannelDto,
    actorUserId: string,
  ): Promise<ChannelView> {
    await this.registry.mutateLocal(async (manager) => {
      const record = await this.requireRecord(resourceUid, manager);
      const {
        expected_revision: expectedRevision,
        reset_config_overrides: resetOverrides = [],
        enabled,
        priority,
        base_url,
        request_config,
        ...structuralPatch
      } = dto;
      const hasStructural = Object.keys(structuralPatch).length > 0;
      if (record.origin.kind === 'official' && hasStructural) throw readOnly();
      if (hasStructural) {
        if (!expectedRevision) throw revisionRequired();
        const nextDocument = { ...record.document, ...structuralPatch };
        const provider = await this.requireProvider(nextDocument.provider_uid, manager);
        assertAdapterKeys(provider.document, nextDocument.adapter_keys);
        await this.writer.append(manager, resourceUid, expectedRevision, nextDocument);
      }
      const configOverrides = compact({
        base_url,
        request_config,
      });
      if (base_url !== undefined || resetOverrides.includes('base_url')) {
        const channelSettings = await manager.getRepository(ChannelInstallation).findOneByOrFail({
          channel_resource_uid: resourceUid,
        });
        const provider = await this.requireProvider(record.document.provider_uid, manager);
        const providerSettings = await manager.getRepository(ProviderInstallation).findOneByOrFail({
          provider_resource_uid: provider.document.resource_uid,
        });
        const nextChannelOverrides = nextConfigOverrides(
          channelSettings.config_overrides,
          configOverrides,
          resetOverrides,
        );
        await this.outboundRoutes.assertCredentialRouteChangeAllowed(manager, actorUserId, [
          {
            channel_resource_uid: resourceUid,
            current_base_url: effectiveOutboundBaseUrl(
              record.document.base_url,
              channelSettings.config_overrides,
              provider.document.base_url,
              providerSettings.config_overrides,
            ),
            next_base_url: effectiveOutboundBaseUrl(
              record.document.base_url,
              nextChannelOverrides,
              provider.document.base_url,
              providerSettings.config_overrides,
            ),
          },
        ]);
      }
      await this.writer.patchChannelSettings(manager, resourceUid, {
        ...(enabled !== undefined ? { enabled } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(Object.keys(configOverrides).length > 0 ? { config_overrides: configOverrides } : {}),
        clear_config_overrides: resetOverrides,
      });
    });
    return this.findOne(resourceUid);
  }

  async remove(resourceUid: string): Promise<void> {
    await this.registry.mutateLocal(async (manager) => {
      const record = await this.requireRecord(resourceUid, manager);
      if (record.origin.kind === 'official') throw readOnly();
      const models = await this.catalog.listCurrent('model_offering', manager);
      if (
        models.some(
          (candidate) =>
            candidate.document.kind === 'model_offering' &&
            candidate.document.lifecycle !== 'retired' &&
            candidate.document.lifecycle !== 'revoked' &&
            candidate.document.allowed_channel_uids.includes(resourceUid),
        )
      ) {
        throw new ConflictException({
          code: 'CATALOG_RESOURCE_IN_USE',
          message: 'channel is referenced by a current model',
        });
      }
      const resource = await manager.getRepository(CatalogResource).findOneByOrFail({
        resource_uid: resourceUid,
      });
      await this.writer.retire(manager, resourceUid, resource.head_revision);
      await this.writer.patchChannelSettings(manager, resourceUid, { enabled: false });
    });
  }

  private async requireProvider(
    resourceUid: string,
    manager?: EntityManager,
  ): Promise<CatalogRecord<CatalogProvider>> {
    const record = await this.catalog.findCurrent<CatalogProvider>(
      resourceUid,
      'provider',
      manager,
    );
    if (
      !record ||
      record.document.lifecycle === 'retired' ||
      record.document.lifecycle === 'revoked'
    ) {
      throw new NotFoundException(`Provider ${resourceUid} not found`);
    }
    return record;
  }

  private async requireRecord(
    resourceUid: string,
    manager?: EntityManager,
  ): Promise<CatalogRecord<CatalogChannelTemplate>> {
    const record = await this.catalog.findCurrent<CatalogChannelTemplate>(
      resourceUid,
      'channel_template',
      manager,
    );
    if (
      !record ||
      record.document.lifecycle === 'retired' ||
      record.document.lifecycle === 'revoked'
    ) {
      throw new NotFoundException(`Channel ${resourceUid} not found`);
    }
    return record;
  }
}

function channelDocument(
  resourceUid: string,
  providerResourceUid: string,
  dto: CreateChannelDto,
): CatalogChannelTemplate {
  return {
    kind: 'channel_template',
    resource_uid: resourceUid,
    revision: 1,
    lifecycle: 'active',
    slug: dto.slug,
    provider_uid: providerResourceUid,
    display_name: dto.display_name,
    invocation_method: dto.invocation_method,
    adapter_keys: [...new Set(dto.adapter_keys)],
    base_url: dto.base_url,
    request_config: dto.request_config ?? {},
  };
}

function toView(
  record: CatalogRecord<CatalogChannelTemplate>,
  settings: ChannelInstallation,
): ChannelView {
  const { provider_uid: providerResourceUid, ...document } = record.document;
  return {
    ...document,
    ...pickOverrides(settings.config_overrides),
    provider_resource_uid: providerResourceUid,
    enabled: settings.enabled,
    priority: settings.priority,
    origin: record.origin,
  };
}

function requireSettings(
  values: ReadonlyMap<string, ChannelInstallation>,
  resourceUid: string,
): ChannelInstallation {
  const settings = values.get(resourceUid);
  if (!settings) throw new Error(`channel settings are missing: ${resourceUid}`);
  return settings;
}

function pickOverrides(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([key]) => OVERRIDE_FIELDS.has(key)));
}

function compact(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

function readOnly(): ConflictException {
  return new ConflictException({
    code: 'CATALOG_RESOURCE_READ_ONLY',
    message: 'official channel structure is read-only; create a local channel instead',
  });
}

function revisionRequired(): ConflictException {
  return new ConflictException({
    code: 'CATALOG_REVISION_CONFLICT',
    message: 'expected_revision is required for local structural updates',
  });
}

function assertAdapterKeys(provider: CatalogProvider, adapterKeys: readonly string[]): void {
  const invalid = adapterKeys.filter((key) => !provider.adapter_keys.includes(key));
  if (adapterKeys.length === 0 || invalid.length > 0) {
    throw new ConflictException({
      code: 'CATALOG_CHANNEL_ADAPTER_MISMATCH',
      message:
        invalid.length > 0
          ? `channel adapters are not declared by provider: ${invalid.join(', ')}`
          : 'channel must declare at least one adapter',
    });
  }
}
