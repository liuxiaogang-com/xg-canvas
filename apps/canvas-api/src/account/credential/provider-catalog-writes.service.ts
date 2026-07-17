import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CatalogChannelTemplate,
  CatalogModelOffering,
  CatalogProvider,
} from '@xgcanvas/model-catalog';
import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { CatalogLocalWriterService, CatalogReadService, type CatalogRecord } from '../catalog';
import { RegistryBootstrapService } from '../registry';
import { assertVendorModelIdsFit, requireVendorContractAdapter } from './vendor-model-contract';

export interface PreparedCredentialChannel {
  channel_resource_uid: string;
  provider: CatalogRecord<CatalogProvider>;
  channel: CatalogRecord<CatalogChannelTemplate>;
}

@Injectable()
export class ProviderCatalogWritesService {
  constructor(
    private readonly catalog: CatalogReadService,
    private readonly writer: CatalogLocalWriterService,
    private readonly registry: RegistryBootstrapService,
  ) {}

  async prepareCredentialChannelInTransaction(
    manager: EntityManager,
    providerResourceUid: string,
    channelResourceUid: string,
    selectedOfficialModelUids: readonly string[] = [],
    vendorContractProfile?: string,
    vendorImportRequested = false,
  ): Promise<PreparedCredentialChannel> {
    const { provider, channel } = await this.requireCredentialOwnerInTransaction(
      manager,
      channelResourceUid,
      providerResourceUid,
    );
    const selected = uniqueNonEmpty(selectedOfficialModelUids);
    const selectedModels = await Promise.all(
      selected.map((uid) =>
        this.catalog.findCurrent<CatalogModelOffering>(uid, 'model_offering', manager),
      ),
    );
    if (
      selectedModels.some(
        (record) =>
          !record ||
          record.origin.kind !== 'official' ||
          record.document.provider_uid !== providerResourceUid ||
          !record.document.allowed_channel_uids.includes(channelResourceUid) ||
          !channel.document.adapter_keys.includes(record.document.adapter_key),
      )
    ) {
      throw new ConflictException(
        'Selected official models are unavailable through the selected Channel',
      );
    }
    if (vendorImportRequested) {
      const adapterKey = requireVendorContractAdapter(vendorContractProfile);
      if (
        !provider.document.adapter_keys.includes(adapterKey) ||
        !channel.document.adapter_keys.includes(adapterKey)
      ) {
        throw new ConflictException(
          `selected Channel does not support vendor contract adapter ${adapterKey}`,
        );
      }
    }
    await this.writer.patchProviderSettings(manager, providerResourceUid, { enabled: true });
    await this.writer.patchChannelSettings(manager, channelResourceUid, { enabled: true });
    return { channel_resource_uid: channelResourceUid, provider, channel };
  }

  async requireCredentialOwnerInTransaction(
    manager: EntityManager,
    channelResourceUid: string,
    expectedProviderResourceUid?: string,
  ): Promise<{
    provider: CatalogRecord<CatalogProvider>;
    channel: CatalogRecord<CatalogChannelTemplate>;
  }> {
    const channel = await this.catalog.findCurrent<CatalogChannelTemplate>(
      channelResourceUid,
      'channel_template',
      manager,
    );
    if (
      !channel ||
      channel.document.lifecycle === 'retired' ||
      channel.document.lifecycle === 'revoked' ||
      (expectedProviderResourceUid !== undefined &&
        channel.document.provider_uid !== expectedProviderResourceUid)
    ) {
      throw new NotFoundException(`Channel ${channelResourceUid} not found for Provider`);
    }
    const provider = await this.requireProvider(channel.document.provider_uid, manager);
    return { provider, channel };
  }

  async enableOfficialModels(
    providerResourceUid: string,
    channelResourceUid: string,
    modelResourceUids: readonly string[],
  ): Promise<number> {
    const unique = uniqueNonEmpty(modelResourceUids);
    if (unique.length === 0) return 0;
    return this.registry.mutateLocal((manager) =>
      this.enableOfficialModelsInTransaction(
        manager,
        providerResourceUid,
        channelResourceUid,
        unique,
      ),
    );
  }

  async enableOfficialModelsInTransaction(
    manager: EntityManager,
    providerResourceUid: string,
    channelResourceUid: string,
    modelResourceUids: readonly string[],
  ): Promise<number> {
    const channel = await this.requireChannel(providerResourceUid, channelResourceUid, manager);
    let enabled = 0;
    for (const resourceUid of uniqueNonEmpty(modelResourceUids)) {
      const record = await this.catalog.findCurrent<CatalogModelOffering>(
        resourceUid,
        'model_offering',
        manager,
      );
      if (
        !record ||
        record.origin.kind !== 'official' ||
        record.document.provider_uid !== providerResourceUid ||
        record.document.lifecycle === 'retired' ||
        record.document.lifecycle === 'revoked' ||
        !record.document.allowed_channel_uids.includes(channelResourceUid) ||
        !channel.document.adapter_keys.includes(record.document.adapter_key)
      ) {
        throw new ConflictException(
          `official model is unavailable through Channel: ${resourceUid}`,
        );
      }
      await this.writer.patchModelSettings(manager, resourceUid, { enabled: true });
      enabled += 1;
    }
    return enabled;
  }

  async importVendorModels(
    providerResourceUid: string,
    channelResourceUid: string,
    vendorIds: readonly string[],
    contractProfile?: string,
  ): Promise<{ created: string[]; skipped: string[] }> {
    const ids = uniqueNonEmpty(vendorIds);
    if (ids.length === 0) return { created: [], skipped: [] };
    const adapterKey = requireVendorContractAdapter(contractProfile);
    return this.registry.mutateLocal((manager) =>
      this.importVendorModelsInTransaction(
        manager,
        providerResourceUid,
        channelResourceUid,
        ids,
        contractProfile,
      ),
    );
  }

  async importVendorModelsInTransaction(
    manager: EntityManager,
    providerResourceUid: string,
    channelResourceUid: string,
    vendorIds: readonly string[],
    contractProfile?: string,
  ): Promise<{ created: string[]; skipped: string[] }> {
    const ids = uniqueNonEmpty(vendorIds);
    if (ids.length === 0) return { created: [], skipped: [] };
    const adapterKey = requireVendorContractAdapter(contractProfile);
    const provider = await this.requireProvider(providerResourceUid, manager);
    assertVendorModelIdsFit(provider.document.slug, ids);
    const channel = await this.requireChannel(providerResourceUid, channelResourceUid, manager);
    if (!provider.document.adapter_keys.includes(adapterKey)) {
      throw new ConflictException(`${contractProfile} requires provider adapter ${adapterKey}`);
    }
    if (!channel.document.adapter_keys.includes(adapterKey)) {
      throw new ConflictException(`${contractProfile} is incompatible with the selected Channel`);
    }
    const models = await this.catalog.listCurrent<CatalogModelOffering>('model_offering', manager);
    const created: string[] = [];
    const skipped: string[] = [];
    for (const vendorId of ids) {
      if (
        models.some(
          (record) =>
            record.document.provider_uid === providerResourceUid &&
            record.document.provider_model_id === vendorId,
        )
      ) {
        skipped.push(vendorId);
        continue;
      }
      const modelId = `${provider.document.slug}:${vendorId}`;
      if (models.some((record) => record.document.model_id === modelId)) {
        skipped.push(vendorId);
        continue;
      }
      const modelUid = randomUUID();
      await this.writer.create(
        manager,
        {
          kind: 'model_offering',
          resource_uid: modelUid,
          revision: 1,
          lifecycle: 'active',
          slug: modelId,
          provider_uid: providerResourceUid,
          model_id: modelId,
          provider_model_id: vendorId,
          display_name: vendorId,
          task_types: ['gen.text'],
          capabilities: ['text_chat', 'streaming'],
          invocation_mode: 'stream',
          adapter_key: adapterKey,
          supports_streaming: true,
          allowed_channel_uids: [channelResourceUid],
          tags: [],
          param_schema: TEXT_CHAT_PARAM_SCHEMA,
          param_constraints: [],
          limits: {},
        },
        { settings: { enabled: true, visibility: 'public', sort_order: 0 } },
      );
      created.push(vendorId);
    }
    return { created, skipped };
  }

  private async requireProvider(
    resourceUid: string,
    manager: Parameters<CatalogReadService['findCurrent']>[2],
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

  private async requireChannel(
    providerResourceUid: string,
    resourceUid: string,
    manager: EntityManager,
  ): Promise<CatalogRecord<CatalogChannelTemplate>> {
    const record = await this.catalog.findCurrent<CatalogChannelTemplate>(
      resourceUid,
      'channel_template',
      manager,
    );
    if (
      !record ||
      record.document.provider_uid !== providerResourceUid ||
      record.document.lifecycle === 'retired' ||
      record.document.lifecycle === 'revoked'
    ) {
      throw new NotFoundException(`Channel ${resourceUid} not found for Provider`);
    }
    return record;
  }
}

const TEXT_CHAT_PARAM_SCHEMA = {
  version: '1.0' as const,
  groups: [{ id: 'generation', label: '生成参数', fields: ['temperature', 'max_tokens'] }],
  properties: {
    temperature: { type: 'number' as const, label: 'Temperature', min: 0, max: 2, step: 0.1 },
    max_tokens: { type: 'integer' as const, label: '最大输出 Token', min: 1 },
  },
  required: [],
  defaults: { temperature: 0.7 },
};

function uniqueNonEmpty(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
