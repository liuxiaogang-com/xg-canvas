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
import { ChannelInstallation } from '../channel/channel-installation.entity';
import { RegistryBootstrapService } from '../registry';
import { CreateProviderDto } from './create-provider.dto';
import { ProviderInstallation } from './provider-installation.entity';
import { UpdateProviderDto } from './update-provider.dto';

const OVERRIDE_FIELDS = new Set(['base_url', 'auth_config']);

export interface ProviderView extends CatalogProvider {
  enabled: boolean;
  sort_order: number;
  origin: CatalogRecord<CatalogProvider>['origin'];
}

@Injectable()
export class ProviderService {
  constructor(
    @InjectRepository(ProviderInstallation)
    private readonly settingsRepo: Repository<ProviderInstallation>,
    private readonly writer: CatalogLocalWriterService,
    private readonly catalog: CatalogReadService,
    private readonly registry: RegistryBootstrapService,
    private readonly outboundRoutes: OutboundRouteSecurityService,
  ) {}

  async create(dto: CreateProviderDto): Promise<ProviderView> {
    const resourceUid = randomUUID();
    await this.registry.mutateLocal(async (manager) => {
      const existing = await this.catalog.listCurrent<CatalogProvider>('provider', manager);
      if (existing.some((record) => record.document.slug === dto.slug)) {
        throw new ConflictException(`Provider with slug "${dto.slug}" already exists`);
      }
      await this.writer.create(manager, providerDocument(resourceUid, dto), {
        settings: {
          enabled: dto.enabled ?? false,
          sort_order: dto.sort_order ?? 0,
        },
      });
    });
    return this.findOne(resourceUid);
  }

  async findAll(): Promise<ProviderView[]> {
    const records = await this.catalog.listCurrent<CatalogProvider>('provider');
    const settings = await this.settingsRepo.find();
    const byUid = new Map(settings.map((row) => [row.provider_resource_uid, row]));
    return records
      .filter(
        (record) =>
          record.document.lifecycle !== 'retired' && record.document.lifecycle !== 'revoked',
      )
      .map((record) => toView(record, requireSettings(byUid, record.document.resource_uid)))
      .sort((a, b) => a.sort_order - b.sort_order || a.display_name.localeCompare(b.display_name));
  }

  async findOne(resourceUid: string): Promise<ProviderView> {
    const record = await this.requireRecord(resourceUid);
    const settings = await this.settingsRepo.findOneBy({ provider_resource_uid: resourceUid });
    if (!settings) throw new Error(`provider settings are missing: ${resourceUid}`);
    return toView(record, settings);
  }

  async update(
    resourceUid: string,
    dto: UpdateProviderDto,
    actorUserId: string,
  ): Promise<ProviderView> {
    await this.registry.mutateLocal(async (manager) => {
      const record = await this.requireRecord(resourceUid, manager);
      const {
        expected_revision: expectedRevision,
        reset_config_overrides: resetOverrides = [],
        enabled,
        sort_order: sortOrder,
        base_url: baseUrl,
        auth_config: authConfig,
        ...structuralPatch
      } = dto;
      const hasStructural = Object.keys(structuralPatch).length > 0;
      if (record.origin.kind === 'official' && hasStructural) throw readOnly();
      if (hasStructural) {
        if (!expectedRevision) throw revisionRequired();
        if (
          typeof structuralPatch.auth_method === 'string' &&
          structuralPatch.auth_method !== record.document.auth_method
        ) {
          await this.assertProviderAuthChangeAllowed(manager, record.document.resource_uid);
        }
        await this.writer.append(manager, resourceUid, expectedRevision, {
          ...record.document,
          ...structuralPatch,
        });
      }
      const configOverrides: Record<string, unknown> = {};
      if (baseUrl !== undefined) configOverrides.base_url = baseUrl;
      if (authConfig !== undefined) configOverrides.auth_config = authConfig;
      if (baseUrl !== undefined || resetOverrides.includes('base_url')) {
        await this.assertProviderRouteChangeAllowed(
          manager,
          actorUserId,
          record,
          configOverrides,
          resetOverrides,
        );
      }
      await this.writer.patchProviderSettings(manager, resourceUid, {
        ...(enabled !== undefined ? { enabled } : {}),
        ...(sortOrder !== undefined ? { sort_order: sortOrder } : {}),
        ...(Object.keys(configOverrides).length > 0 ? { config_overrides: configOverrides } : {}),
        clear_config_overrides: resetOverrides,
      });
    });
    return this.findOne(resourceUid);
  }

  private async assertProviderRouteChangeAllowed(
    manager: EntityManager,
    actorUserId: string,
    provider: CatalogRecord<CatalogProvider>,
    patch: Record<string, unknown>,
    clear: readonly string[],
  ): Promise<void> {
    const providerSettings = await manager.getRepository(ProviderInstallation).findOneByOrFail({
      provider_resource_uid: provider.document.resource_uid,
    });
    const nextProviderOverrides = nextConfigOverrides(
      providerSettings.config_overrides,
      patch,
      clear,
    );
    const channels = (
      await this.catalog.listCurrent<CatalogChannelTemplate>('channel_template', manager)
    ).filter((record) => record.document.provider_uid === provider.document.resource_uid);
    if (channels.length === 0) return;
    const channelSettings = await manager.getRepository(ChannelInstallation).find();
    const settingsByUid = new Map(
      channelSettings.map((row) => [row.channel_resource_uid, row.config_overrides]),
    );
    await this.outboundRoutes.assertCredentialRouteChangeAllowed(
      manager,
      actorUserId,
      channels.map((channel) => {
        const channelOverrides = settingsByUid.get(channel.document.resource_uid);
        if (!channelOverrides) {
          throw new Error(`channel settings are missing: ${channel.document.resource_uid}`);
        }
        return {
          channel_resource_uid: channel.document.resource_uid,
          current_base_url: effectiveOutboundBaseUrl(
            channel.document.base_url,
            channelOverrides,
            provider.document.base_url,
            providerSettings.config_overrides,
          ),
          next_base_url: effectiveOutboundBaseUrl(
            channel.document.base_url,
            channelOverrides,
            provider.document.base_url,
            nextProviderOverrides,
          ),
        };
      }),
    );
  }

  private async assertProviderAuthChangeAllowed(
    manager: EntityManager,
    providerResourceUid: string,
  ): Promise<void> {
    const channels = (
      await this.catalog.listCurrent<CatalogChannelTemplate>('channel_template', manager)
    ).filter(
      (record) =>
        record.document.provider_uid === providerResourceUid &&
        record.document.lifecycle !== 'retired' &&
        record.document.lifecycle !== 'revoked',
    );
    if (channels.length === 0) return;
    const rows = (await manager.query(
      `SELECT EXISTS (
         SELECT 1
           FROM account.credentials
          WHERE channel_resource_uid = ANY($1::uuid[])
            AND archived_at IS NULL
       ) AS present`,
      [channels.map((record) => record.document.resource_uid)],
    )) as Array<{ present: boolean }>;
    if (rows[0]?.present === true) {
      throw new ConflictException({
        code: 'CATALOG_CREDENTIAL_AUTH_CONFLICT',
        message: 'archive existing Provider credentials before changing auth_method',
      });
    }
  }

  async remove(resourceUid: string): Promise<void> {
    await this.registry.mutateLocal(async (manager) => {
      const record = await this.requireRecord(resourceUid, manager);
      if (record.origin.kind === 'official') throw readOnly();
      const current = await this.catalog.listCurrent(undefined, manager);
      const inUse = current.some((candidate) => {
        if (
          candidate.document.lifecycle === 'retired' ||
          candidate.document.lifecycle === 'revoked'
        )
          return false;
        return (
          (candidate.document.kind === 'channel_template' ||
            candidate.document.kind === 'model_offering') &&
          candidate.document.provider_uid === resourceUid
        );
      });
      if (inUse) {
        throw new ConflictException({
          code: 'CATALOG_RESOURCE_IN_USE',
          message: 'provider still has current channels or models',
        });
      }
      const resource = await manager.getRepository(CatalogResource).findOneByOrFail({
        resource_uid: resourceUid,
      });
      await this.writer.retire(manager, resourceUid, resource.head_revision);
      await this.writer.patchProviderSettings(manager, resourceUid, { enabled: false });
    });
  }

  private async requireRecord(
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
}

function providerDocument(resourceUid: string, dto: CreateProviderDto): CatalogProvider {
  return {
    kind: 'provider',
    resource_uid: resourceUid,
    revision: 1,
    lifecycle: 'active',
    slug: dto.slug,
    display_name: dto.display_name,
    icon_url: dto.icon_url,
    homepage_url: dto.homepage_url,
    documentation_url: dto.documentation_url,
    description: dto.description,
    auth_method: dto.auth_method ?? 'api_key',
    auth_config: dto.auth_config ?? {},
    base_url: dto.base_url,
    invocation_methods: dto.invocation_methods ?? ['http'],
    adapter_keys: dto.adapter_keys,
    sdk_package: dto.sdk_package,
    supported_regions: dto.supported_regions ?? [],
  };
}

function toView(
  record: CatalogRecord<CatalogProvider>,
  settings: ProviderInstallation,
): ProviderView {
  return {
    ...record.document,
    ...pickOverrides(settings.config_overrides, OVERRIDE_FIELDS),
    enabled: settings.enabled,
    sort_order: settings.sort_order,
    origin: record.origin,
  };
}

function requireSettings(
  values: ReadonlyMap<string, ProviderInstallation>,
  resourceUid: string,
): ProviderInstallation {
  const settings = values.get(resourceUid);
  if (!settings) throw new Error(`provider settings are missing: ${resourceUid}`);
  return settings;
}

function pickOverrides(
  values: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([key]) => allowed.has(key)));
}

function readOnly(): ConflictException {
  return new ConflictException({
    code: 'CATALOG_RESOURCE_READ_ONLY',
    message: 'official provider structure is read-only; create a local provider instead',
  });
}

function revisionRequired(): ConflictException {
  return new ConflictException({
    code: 'CATALOG_REVISION_CONFLICT',
    message: 'expected_revision is required for local structural updates',
  });
}
