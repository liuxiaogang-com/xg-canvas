import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type {
  CatalogChannelTemplate,
  CatalogModelOffering,
  CatalogProvider,
  CatalogRateCard,
} from '@xgcanvas/model-catalog';
import type { CatalogVisibility, ModelInputContract } from '@xgcanvas/shared-types';
import type { EntityManager } from 'typeorm';
import { CatalogReadService, type CatalogRecord } from '../catalog';
import { CreateModelDefinitionDto } from './create-model-definition.dto';
import { parseOptionalModelInputContract } from './model-input-contract.schema';
import { ModelSettings } from './model-settings.entity';

const EMPTY_PARAM_SCHEMA = {
  version: '1.0' as const,
  groups: [],
  properties: {},
  required: [],
  defaults: {},
};

export interface ModelDefinitionView extends Omit<
  CatalogModelOffering,
  'provider_uid' | 'allowed_channel_uids'
> {
  provider_resource_uid: string;
  allowed_channel_resource_uids: string[];
  enabled: boolean;
  visibility: CatalogVisibility;
  sort_order: number;
  deprecated: boolean;
  pricing: Record<string, unknown> | null;
  rate_card_revision: number | null;
  rate_card_revision_id: string | null;
  provider: {
    resource_uid: string;
    slug: string;
    display_name: string;
    icon_url?: string;
  };
  origin: CatalogRecord<CatalogModelOffering>['origin'];
}

export function createModelDocument(
  resourceUid: string,
  dto: CreateModelDefinitionDto,
  adapterKey: string,
  allowedChannelUids: string[],
  inputContract: ModelInputContract | undefined,
  rateCardUid: string | undefined,
): CatalogModelOffering {
  return {
    kind: 'model_offering',
    resource_uid: resourceUid,
    revision: 1,
    lifecycle: 'active',
    slug: dto.model_id,
    provider_uid: dto.provider_resource_uid,
    model_id: dto.model_id,
    provider_model_id: dto.provider_model_id,
    display_name: dto.display_name,
    description: dto.description,
    icon_url: dto.icon_url,
    task_types: dto.task_types as CatalogModelOffering['task_types'],
    capabilities: (dto.capabilities ?? []) as CatalogModelOffering['capabilities'],
    invocation_mode: dto.invocation_mode ?? 'sync',
    adapter_key: adapterKey,
    supports_streaming: dto.supports_streaming ?? false,
    allowed_channel_uids: allowedChannelUids,
    tags: dto.tags ?? [],
    param_schema: (dto.param_schema ?? EMPTY_PARAM_SCHEMA) as CatalogModelOffering['param_schema'],
    param_constraints: (dto.param_constraints ?? []) as CatalogModelOffering['param_constraints'],
    input_contract: inputContract,
    poll_policy: dto.poll_policy as CatalogModelOffering['poll_policy'],
    limits: dto.limits ?? {},
    rate_card_uid: rateCardUid,
    deprecated_message: dto.deprecated_message,
  };
}

export function createRateCardDocument(
  resourceUid: string,
  modelUid: string,
  modelId: string,
  pricing: Record<string, unknown>,
): CatalogRateCard {
  return {
    kind: 'rate_card',
    resource_uid: resourceUid,
    revision: 1,
    lifecycle: 'active',
    slug: `${modelId}:default`,
    model_uid: modelUid,
    pricing,
  };
}

export function normalizeInputContract(
  value: ModelInputContract | undefined,
): ModelInputContract | undefined {
  const parsed = parseOptionalModelInputContract(value);
  if (!parsed.success) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'input_contract is invalid',
      details: { input_contract: parsed.message },
    });
  }
  return parsed.data;
}

export function requireSettings(
  values: ReadonlyMap<string, ModelSettings>,
  resourceUid: string,
): ModelSettings {
  const settings = values.get(resourceUid);
  if (!settings) throw new Error(`model settings are missing: ${resourceUid}`);
  return settings;
}

export async function assertUniqueModelId(
  catalog: CatalogReadService,
  modelId: string,
  manager: EntityManager,
): Promise<void> {
  const models = await catalog.listCurrent<CatalogModelOffering>('model_offering', manager);
  if (models.some((record) => record.document.model_id === modelId)) {
    throw new ConflictException(`Model with model_id "${modelId}" already exists`);
  }
}

export async function assertCompatibleChannels(
  catalog: CatalogReadService,
  manager: EntityManager,
  providerUid: string,
  channelUids: readonly string[],
  adapterKey: string,
): Promise<void> {
  const unique = [...new Set(channelUids)];
  if (unique.length === 0) {
    throw new BadRequestException('at least one allowed channel is required');
  }
  const channels = await Promise.all(
    unique.map((uid) =>
      catalog.findCurrent<CatalogChannelTemplate>(uid, 'channel_template', manager),
    ),
  );
  if (
    channels.some(
      (record) =>
        !record ||
        record.document.provider_uid !== providerUid ||
        record.document.lifecycle === 'retired' ||
        record.document.lifecycle === 'revoked' ||
        !record.document.adapter_keys.includes(adapterKey),
    )
  ) {
    throw new BadRequestException(
      'allowed channels must be current Catalog channels compatible with the selected adapter',
    );
  }
}

export async function requireProviderRecord(
  catalog: CatalogReadService,
  resourceUid: string,
  manager?: EntityManager,
): Promise<CatalogRecord<CatalogProvider>> {
  const record = await catalog.findCurrent<CatalogProvider>(resourceUid, 'provider', manager);
  if (
    !record ||
    record.document.lifecycle === 'retired' ||
    record.document.lifecycle === 'revoked'
  ) {
    throw new NotFoundException(`Provider ${resourceUid} not found`);
  }
  return record;
}

export async function requireRateRecord(
  catalog: CatalogReadService,
  resourceUid: string,
  manager?: EntityManager,
): Promise<CatalogRecord<CatalogRateCard>> {
  const record = await catalog.findCurrent<CatalogRateCard>(resourceUid, 'rate_card', manager);
  if (
    !record ||
    record.document.lifecycle === 'retired' ||
    record.document.lifecycle === 'revoked'
  ) {
    throw new NotFoundException(`Rate Card ${resourceUid} not found`);
  }
  return record;
}

export async function requireModelRecord(
  catalog: CatalogReadService,
  resourceUid: string,
  manager?: EntityManager,
): Promise<CatalogRecord<CatalogModelOffering>> {
  const record = await catalog.findCurrent<CatalogModelOffering>(
    resourceUid,
    'model_offering',
    manager,
  );
  if (
    !record ||
    record.document.lifecycle === 'retired' ||
    record.document.lifecycle === 'revoked'
  ) {
    throw new NotFoundException(`Model definition ${resourceUid} not found`);
  }
  return record;
}

export function toModelDefinitionView(
  record: CatalogRecord<CatalogModelOffering>,
  settings: ModelSettings,
  provider: CatalogRecord<CatalogProvider>,
  rate: CatalogRecord<CatalogRateCard> | null,
): ModelDefinitionView {
  const {
    provider_uid: providerResourceUid,
    allowed_channel_uids: allowedChannelResourceUids,
    ...document
  } = record.document;
  return {
    ...document,
    provider_resource_uid: providerResourceUid,
    allowed_channel_resource_uids: allowedChannelResourceUids,
    enabled: settings.enabled,
    visibility: settings.visibility,
    sort_order: settings.sort_order,
    deprecated: record.document.lifecycle === 'deprecated',
    pricing: rate?.document.pricing ?? null,
    rate_card_revision: rate?.origin.revision ?? null,
    rate_card_revision_id: rate?.origin.revision_id ?? null,
    provider: {
      resource_uid: provider.document.resource_uid,
      slug: provider.document.slug,
      display_name: provider.document.display_name,
      icon_url: provider.document.icon_url,
    },
    origin: record.origin,
  };
}

export function readOnly(): ConflictException {
  return new ConflictException({
    code: 'CATALOG_RESOURCE_READ_ONLY',
    message: 'official model structure is read-only; fork it before editing',
  });
}

export function revisionRequired(): ConflictException {
  return new ConflictException({
    code: 'CATALOG_REVISION_CONFLICT',
    message: 'expected_revision is required for local structural updates',
  });
}

export function rateRevisionRequired(): ConflictException {
  return new ConflictException({
    code: 'CATALOG_REVISION_CONFLICT',
    message: 'expected_rate_revision is required for pricing updates',
  });
}
