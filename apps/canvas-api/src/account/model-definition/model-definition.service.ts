import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { CatalogModelOffering } from '@xgcanvas/model-catalog';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import {
  CatalogLocalWriterService,
  CatalogReadService,
  CatalogResource,
  type CatalogRecord,
} from '../catalog';
import { ModelAvailabilityService } from '../invoke/model-availability.service';
import { RegistryBootstrapService } from '../registry';
import { CreateModelDefinitionDto } from './create-model-definition.dto';
import { ForkModelDefinitionDto } from './fork-model-definition.dto';
import {
  assertCompatibleChannels,
  assertUniqueModelId,
  createModelDocument,
  createRateCardDocument,
  type ModelDefinitionView,
  normalizeInputContract,
  rateRevisionRequired,
  readOnly,
  requireModelRecord,
  requireProviderRecord,
  requireRateRecord,
  requireSettings,
  revisionRequired,
  toModelDefinitionView,
} from './model-definition.catalog';
import { ModelSettings } from './model-settings.entity';
import { UpdateModelDefinitionDto } from './update-model-definition.dto';

export type { ModelDefinitionView } from './model-definition.catalog';

@Injectable()
export class ModelDefinitionService {
  constructor(
    @InjectRepository(ModelSettings)
    private readonly settingsRepo: Repository<ModelSettings>,
    private readonly availability: ModelAvailabilityService,
    private readonly writer: CatalogLocalWriterService,
    private readonly catalog: CatalogReadService,
    private readonly registry: RegistryBootstrapService,
  ) {}

  async create(dto: CreateModelDefinitionDto): Promise<ModelDefinitionView> {
    const modelUid = randomUUID();
    await this.registry.mutateLocal(async (manager) => {
      await assertUniqueModelId(this.catalog, dto.model_id, manager);
      const provider = await requireProviderRecord(
        this.catalog,
        dto.provider_resource_uid,
        manager,
      );
      const allowedChannelUids = dto.allowed_channel_resource_uids;
      const inputContract = normalizeInputContract(dto.input_contract);
      const adapterKey = dto.adapter_key;
      if (!provider.document.adapter_keys.includes(adapterKey)) {
        throw new BadRequestException('adapter_key must be declared by the selected provider');
      }
      await assertCompatibleChannels(
        this.catalog,
        manager,
        dto.provider_resource_uid,
        allowedChannelUids,
        adapterKey,
      );
      let rateCardUid: string | undefined;
      if (dto.pricing) {
        rateCardUid = randomUUID();
        await this.writer.create(
          manager,
          createRateCardDocument(rateCardUid, modelUid, dto.model_id, dto.pricing),
        );
      }
      await this.writer.create(
        manager,
        createModelDocument(
          modelUid,
          dto,
          adapterKey,
          allowedChannelUids,
          inputContract,
          rateCardUid,
        ),
        {
          settings: {
            enabled: dto.enabled ?? false,
            visibility: dto.visibility ?? 'public',
            sort_order: dto.sort_order ?? 0,
          },
        },
      );
    });
    return this.findOne(modelUid);
  }

  async findAll(includeAll = false): Promise<ModelDefinitionView[]> {
    const records = await this.catalog.listCurrent<CatalogModelOffering>('model_offering');
    const settings = await this.settingsRepo.find();
    const settingsByUid = new Map(settings.map((row) => [row.model_resource_uid, row]));
    const allCurrent = records.filter(
      (record) =>
        record.document.lifecycle !== 'retired' && record.document.lifecycle !== 'revoked',
    );
    const available = includeAll
      ? null
      : await this.availability.availableIds(allCurrent.map((record) => record.document.model_id));
    const views = await Promise.all(
      allCurrent.flatMap((record) => {
        if (available && !available.has(record.document.model_id)) return [];
        return [this.toView(record, requireSettings(settingsByUid, record.document.resource_uid))];
      }),
    );
    return views.sort(
      (a, b) => a.sort_order - b.sort_order || a.display_name.localeCompare(b.display_name),
    );
  }

  async findOne(resourceUid: string): Promise<ModelDefinitionView> {
    const record = await requireModelRecord(this.catalog, resourceUid);
    const settings = await this.settingsRepo.findOneBy({ model_resource_uid: resourceUid });
    if (!settings) throw new Error(`model settings are missing: ${resourceUid}`);
    return this.toView(record, settings);
  }

  async update(resourceUid: string, dto: UpdateModelDefinitionDto): Promise<ModelDefinitionView> {
    await this.registry.mutateLocal(async (manager) => {
      const record = await requireModelRecord(this.catalog, resourceUid, manager);
      const {
        expected_revision: expectedRevision,
        expected_rate_revision: expectedRateRevision,
        enabled,
        visibility,
        sort_order: sortOrder,
        pricing,
        allowed_channel_resource_uids: allowedChannelUids,
        adapter_key: nextAdapterKey,
        ...structuralPatch
      } = dto;
      const pricingProvided = Object.prototype.hasOwnProperty.call(dto, 'pricing');
      const allowedChannelsProvided = Object.prototype.hasOwnProperty.call(
        dto,
        'allowed_channel_resource_uids',
      );
      const adapterKeyProvided = Object.prototype.hasOwnProperty.call(dto, 'adapter_key');
      const hasStructural =
        Object.keys(structuralPatch).length > 0 || allowedChannelsProvided || adapterKeyProvided;
      if (record.origin.kind === 'official' && (hasStructural || pricingProvided)) throw readOnly();

      let nextDocument = {
        ...record.document,
        ...structuralPatch,
        ...(allowedChannelsProvided ? { allowed_channel_uids: allowedChannelUids } : {}),
        ...(adapterKeyProvided ? { adapter_key: nextAdapterKey } : {}),
        ...(Object.prototype.hasOwnProperty.call(structuralPatch, 'input_contract')
          ? { input_contract: normalizeInputContract(structuralPatch.input_contract) }
          : {}),
      } as CatalogModelOffering;
      if (nextDocument.lifecycle === 'retired' || nextDocument.lifecycle === 'revoked') {
        throw new BadRequestException('use DELETE to retire a local model');
      }
      const provider = await requireProviderRecord(
        this.catalog,
        nextDocument.provider_uid,
        manager,
      );
      if (!provider.document.adapter_keys.includes(nextDocument.adapter_key)) {
        throw new BadRequestException('adapter_key must be declared by the selected provider');
      }
      await assertCompatibleChannels(
        this.catalog,
        manager,
        nextDocument.provider_uid,
        nextDocument.allowed_channel_uids,
        nextDocument.adapter_key,
      );

      let linkChanged = false;
      if (pricingProvided) {
        if (pricing === undefined) {
          throw new BadRequestException('pricing must be an object or null');
        } else if (pricing === null) {
          if (nextDocument.rate_card_uid) {
            if (!expectedRateRevision) throw rateRevisionRequired();
            const rate = await requireRateRecord(
              this.catalog,
              nextDocument.rate_card_uid,
              manager,
            );
            if (rate.origin.kind !== 'local') throw readOnly();
            if (rate.origin.revision !== expectedRateRevision) {
              throw new ConflictException({
                code: 'CATALOG_REVISION_CONFLICT',
                message: `expected Rate Card revision ${expectedRateRevision}, current is ${rate.origin.revision}`,
              });
            }
            await this.writer.retire(
              manager,
              rate.document.resource_uid,
              expectedRateRevision,
            );
            nextDocument = { ...nextDocument, rate_card_uid: undefined };
            linkChanged = true;
          }
        } else if (nextDocument.rate_card_uid) {
          if (!expectedRateRevision) throw rateRevisionRequired();
          const rate = await requireRateRecord(this.catalog, nextDocument.rate_card_uid, manager);
          if (rate.origin.kind !== 'local') throw readOnly();
          if (rate.origin.revision !== expectedRateRevision) {
            throw new ConflictException({
              code: 'CATALOG_REVISION_CONFLICT',
              message: `expected Rate Card revision ${expectedRateRevision}, current is ${rate.origin.revision}`,
            });
          }
          await this.writer.append(manager, rate.document.resource_uid, expectedRateRevision, {
            ...rate.document,
            pricing,
          });
        } else {
          const rateUid = randomUUID();
          await this.writer.create(
            manager,
            createRateCardDocument(rateUid, resourceUid, nextDocument.model_id, pricing),
          );
          nextDocument = { ...nextDocument, rate_card_uid: rateUid };
          linkChanged = true;
        }
      }

      if (hasStructural || linkChanged) {
        if (!expectedRevision) throw revisionRequired();
        await this.writer.append(manager, resourceUid, expectedRevision, nextDocument);
      }
      await this.writer.patchModelSettings(manager, resourceUid, {
        ...(enabled !== undefined ? { enabled } : {}),
        ...(visibility !== undefined ? { visibility } : {}),
        ...(sortOrder !== undefined ? { sort_order: sortOrder } : {}),
      });
    });
    return this.findOne(resourceUid);
  }

  async fork(resourceUid: string, dto: ForkModelDefinitionDto): Promise<ModelDefinitionView> {
    const forkUid = randomUUID();
    await this.registry.mutateLocal(async (manager) => {
      const source = await requireModelRecord(this.catalog, resourceUid, manager);
      if (source.origin.revision !== dto.expected_source_revision) {
        throw new ConflictException({
          code: 'CATALOG_REVISION_CONFLICT',
          message: `expected source revision ${dto.expected_source_revision}, current is ${source.origin.revision}`,
        });
      }
      await assertUniqueModelId(this.catalog, dto.new_model_id, manager);
      let rateCardUid: string | undefined;
      if (source.document.rate_card_uid) {
        const sourceRate = await requireRateRecord(
          this.catalog,
          source.document.rate_card_uid,
          manager,
        );
        rateCardUid = randomUUID();
        await this.writer.create(
          manager,
          createRateCardDocument(
            rateCardUid,
            forkUid,
            dto.new_model_id,
            sourceRate.document.pricing,
          ),
          {
            forked_from_resource_uid: sourceRate.document.resource_uid,
            forked_from_revision: sourceRate.origin.revision,
          },
        );
      }
      await this.writer.create(
        manager,
        {
          ...source.document,
          resource_uid: forkUid,
          revision: 1,
          lifecycle: 'active',
          slug: dto.new_model_id,
          model_id: dto.new_model_id,
          display_name: dto.display_name ?? `${source.document.display_name}（自定义）`,
          rate_card_uid: rateCardUid,
        },
        {
          settings: { enabled: false, visibility: 'public', sort_order: 0 },
          forked_from_resource_uid: source.document.resource_uid,
          forked_from_revision: source.origin.revision,
        },
      );
    });
    return this.findOne(forkUid);
  }

  async remove(resourceUid: string): Promise<void> {
    await this.registry.mutateLocal(async (manager) => {
      const record = await requireModelRecord(this.catalog, resourceUid, manager);
      if (record.origin.kind === 'official') throw readOnly();
      if (record.document.rate_card_uid) {
        const rate = await requireRateRecord(this.catalog, record.document.rate_card_uid, manager);
        if (rate.origin.kind === 'local') {
          await this.writer.retire(manager, rate.document.resource_uid, rate.origin.revision);
        }
      }
      const resource = await manager.getRepository(CatalogResource).findOneByOrFail({
        resource_uid: resourceUid,
      });
      await this.writer.retire(manager, resourceUid, resource.head_revision);
      await this.writer.patchModelSettings(manager, resourceUid, { enabled: false });
    });
  }

  private async toView(
    record: CatalogRecord<CatalogModelOffering>,
    settings: ModelSettings,
  ): Promise<ModelDefinitionView> {
    const provider = await requireProviderRecord(this.catalog, record.document.provider_uid);
    const rate = record.document.rate_card_uid
      ? await requireRateRecord(this.catalog, record.document.rate_card_uid)
      : null;
    return toModelDefinitionView(record, settings, provider, rate);
  }
}
