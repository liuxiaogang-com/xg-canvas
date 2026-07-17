import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  CatalogChannelTemplateSchema,
  CatalogModelOfferingSchema,
  CatalogProviderSchema,
  CatalogRateCardSchema,
  assertValidParamContract,
  canonicalJson,
  ensureStandardSchema,
  validateNonSecretConfig,
  validateOutboundBaseUrl,
  type CatalogChannelTemplate,
  type CatalogModelOffering,
  type CatalogProvider,
  type CatalogRateCard,
} from '@xgcanvas/model-catalog';
import type { CatalogVisibility } from '@xgcanvas/shared-types';
import type { EntityManager } from 'typeorm';
import { ChannelInstallation } from '../channel/channel-installation.entity';
import { ModelSettings } from '../model-definition/model-settings.entity';
import { ProviderInstallation } from '../provider/provider-installation.entity';
import { CatalogResource, CatalogResourceRevision, CatalogRuntimeState } from './catalog.entities';
import { CatalogLocalService } from './catalog-local.service';
import { assertStableCatalogOwner } from './catalog-owner';

export type CatalogDocument =
  | CatalogProvider
  | CatalogChannelTemplate
  | CatalogModelOffering
  | CatalogRateCard;

export interface CatalogRuntimeSettingsPatch {
  enabled?: boolean;
  visibility?: CatalogVisibility;
  sort_order?: number;
  priority?: number;
  config_overrides?: Record<string, unknown>;
  clear_config_overrides?: readonly string[];
}

export interface LocalWrite<T extends CatalogDocument> {
  document: T;
  revision: CatalogResourceRevision;
  changed: boolean;
}

const PROVIDER_OVERRIDE_KEYS = new Set(['base_url', 'auth_config']);
const CHANNEL_OVERRIDE_KEYS = new Set([
  'base_url',
  'request_config',
]);

@Injectable()
export class CatalogLocalWriterService {
  constructor(private readonly local: CatalogLocalService) {}

  async create<T extends CatalogDocument>(
    manager: EntityManager,
    document: T,
    options: {
      settings?: CatalogRuntimeSettingsPatch;
      forked_from_resource_uid?: string;
      forked_from_revision?: number;
    } = {},
  ): Promise<LocalWrite<T>> {
    const parsed = parseDocument({ ...document, revision: 1 }) as T;
    await assertValidForkSource(manager, parsed.kind, options);
    const sourceId = await this.local.getLocalSourceId(manager);
    const revision = await this.local.createResource(manager, sourceId, {
      resource_uid: parsed.resource_uid,
      kind: parsed.kind,
      slug: parsed.slug,
      document: parsed as unknown as Record<string, unknown>,
      forked_from_resource_uid: options.forked_from_resource_uid,
      forked_from_revision: options.forked_from_revision,
    });
    await this.ensureSettings(manager, parsed, options.settings ?? {});
    return { document: parsed, revision, changed: true };
  }

  async append<T extends CatalogDocument>(
    manager: EntityManager,
    resourceUid: string,
    expectedRevision: number,
    document: T,
    options: { force?: boolean } = {},
  ): Promise<LocalWrite<T>> {
    const state = await manager.getRepository(CatalogRuntimeState).findOneByOrFail({ id: 1 });
    const resource = await manager.getRepository(CatalogResource).findOneByOrFail({
      resource_uid: resourceUid,
    });
    if (resource.source_id !== state.local_source_id || resource.kind !== document.kind) {
      throw new ConflictException({
        code: 'CATALOG_RESOURCE_READ_ONLY',
        message: 'only local Catalog resources can append revisions',
      });
    }
    if (resource.head_revision !== expectedRevision) {
      throw revisionConflict(expectedRevision, resource.head_revision);
    }
    const current = await manager.getRepository(CatalogResourceRevision).findOneByOrFail({
      resource_uid: resourceUid,
      revision: expectedRevision,
    });
    const comparable = parseDocument({
      ...document,
      resource_uid: resourceUid,
      revision: expectedRevision,
    }) as T;
    assertStableCatalogOwner(current.document, comparable as unknown as Record<string, unknown>);
    if (!options.force && canonicalJson(current.document) === canonicalJson(comparable)) {
      return { document: comparable, revision: current, changed: false };
    }
    const next = parseDocument({
      ...document,
      resource_uid: resourceUid,
      revision: expectedRevision + 1,
    }) as T;
    const revision = await this.local.appendRevision(
      manager,
      resourceUid,
      expectedRevision,
      next as unknown as Record<string, unknown>,
    );
    return { document: next, revision, changed: true };
  }

  async retire(
    manager: EntityManager,
    resourceUid: string,
    expectedRevision: number,
  ): Promise<LocalWrite<CatalogDocument>> {
    const current = await manager.getRepository(CatalogResourceRevision).findOneByOrFail({
      resource_uid: resourceUid,
      revision: expectedRevision,
    });
    return this.append(
      manager,
      resourceUid,
      expectedRevision,
      { ...current.document, lifecycle: 'retired' } as CatalogDocument,
      { force: true },
    );
  }

  async patchProviderSettings(
    manager: EntityManager,
    resourceUid: string,
    patch: CatalogRuntimeSettingsPatch,
  ): Promise<ProviderInstallation> {
    await assertResourceKind(manager, resourceUid, 'provider');
    validateOverrides(patch, PROVIDER_OVERRIDE_KEYS, 'provider');
    const repo = manager.getRepository(ProviderInstallation);
    const row =
      (await repo.findOneBy({ provider_resource_uid: resourceUid })) ??
      repo.create({
        provider_resource_uid: resourceUid,
        enabled: false,
        sort_order: 0,
        config_overrides: {},
      });
    if (patch.enabled !== undefined) row.enabled = patch.enabled;
    if (patch.sort_order !== undefined) row.sort_order = patch.sort_order;
    row.config_overrides = mergeOverrides(row.config_overrides, patch);
    return repo.save(row);
  }

  async patchChannelSettings(
    manager: EntityManager,
    resourceUid: string,
    patch: CatalogRuntimeSettingsPatch,
  ): Promise<ChannelInstallation> {
    await assertResourceKind(manager, resourceUid, 'channel_template');
    validateOverrides(patch, CHANNEL_OVERRIDE_KEYS, 'channel');
    const repo = manager.getRepository(ChannelInstallation);
    const row =
      (await repo.findOneBy({ channel_resource_uid: resourceUid })) ??
      repo.create({
        channel_resource_uid: resourceUid,
        enabled: false,
        priority: 0,
        config_overrides: {},
      });
    if (patch.enabled !== undefined) row.enabled = patch.enabled;
    if (patch.priority !== undefined) row.priority = patch.priority;
    row.config_overrides = mergeOverrides(row.config_overrides, patch);
    return repo.save(row);
  }

  async patchModelSettings(
    manager: EntityManager,
    resourceUid: string,
    patch: CatalogRuntimeSettingsPatch,
  ): Promise<ModelSettings> {
    await assertResourceKind(manager, resourceUid, 'model_offering');
    if (patch.config_overrides || patch.clear_config_overrides?.length) {
      throw new ConflictException('model settings do not support structural overrides');
    }
    const repo = manager.getRepository(ModelSettings);
    const row =
      (await repo.findOneBy({ model_resource_uid: resourceUid })) ??
      repo.create({
        model_resource_uid: resourceUid,
        enabled: false,
        visibility: 'public',
        sort_order: 0,
      });
    if (patch.enabled !== undefined) row.enabled = patch.enabled;
    if (patch.visibility !== undefined) row.visibility = patch.visibility;
    if (patch.sort_order !== undefined) row.sort_order = patch.sort_order;
    return repo.save(row);
  }

  private async ensureSettings(
    manager: EntityManager,
    document: CatalogDocument,
    patch: CatalogRuntimeSettingsPatch,
  ): Promise<void> {
    if (document.kind === 'provider') {
      await this.patchProviderSettings(manager, document.resource_uid, patch);
    } else if (document.kind === 'channel_template') {
      await this.patchChannelSettings(manager, document.resource_uid, patch);
    } else if (document.kind === 'model_offering') {
      await this.patchModelSettings(manager, document.resource_uid, patch);
    } else if (Object.keys(patch).length > 0) {
      throw new ConflictException('Rate Cards do not have runtime settings');
    }
  }
}

function parseDocument(value: CatalogDocument): CatalogDocument {
  switch (value.kind) {
    case 'provider':
      return CatalogProviderSchema.parse(value) as CatalogProvider;
    case 'channel_template':
      return CatalogChannelTemplateSchema.parse(value) as CatalogChannelTemplate;
    case 'model_offering': {
      const contract = assertValidParamContract(
        ensureStandardSchema(value.param_schema),
        value.param_constraints,
      );
      return CatalogModelOfferingSchema.parse({
        ...value,
        param_schema: contract.schema,
        param_constraints: contract.constraints,
      }) as CatalogModelOffering;
    }
    case 'rate_card':
      return CatalogRateCardSchema.parse(value) as CatalogRateCard;
  }
}

function mergeOverrides(
  current: Record<string, unknown>,
  patch: CatalogRuntimeSettingsPatch,
): Record<string, unknown> {
  const result = { ...current, ...(patch.config_overrides ?? {}) };
  for (const key of patch.clear_config_overrides ?? []) delete result[key];
  return result;
}

function validateOverrides(
  patch: CatalogRuntimeSettingsPatch,
  allowed: ReadonlySet<string>,
  kind: string,
): void {
  const keys = [
    ...Object.keys(patch.config_overrides ?? {}),
    ...(patch.clear_config_overrides ?? []),
  ];
  const invalid = keys.filter((key) => !allowed.has(key));
  if (invalid.length > 0) {
    throw new ConflictException(`${kind} override keys are not allowed: ${invalid.join(', ')}`);
  }
  const overrides = patch.config_overrides ?? {};
  if (Object.hasOwn(overrides, 'base_url')) {
    const value = overrides.base_url;
    if (typeof value !== 'string') throw invalidOutboundConfig('base_url must be a string');
    const issues = validateOutboundBaseUrl(value);
    if (issues.length > 0) throw invalidOutboundConfig(formatIssues('base_url', issues));
  }
  if (Object.hasOwn(overrides, 'request_config')) {
    const value = overrides.request_config;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw invalidOutboundConfig('request_config must be an object');
    }
    const issues = validateNonSecretConfig(value, 'request_config');
    if (issues.length > 0) throw invalidOutboundConfig(formatIssues('request_config', issues));
  }
  if (Object.hasOwn(overrides, 'auth_config')) {
    const value = overrides.auth_config;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw invalidOutboundConfig('auth_config must be an object');
    }
    const issues = validateNonSecretConfig(value, 'auth_config');
    if (issues.length > 0) throw invalidOutboundConfig(formatIssues('auth_config', issues));
  }
}

function formatIssues(
  field: string,
  issues: readonly { path: readonly (string | number)[]; message: string }[],
): string {
  return issues
    .map(
      (issue) => `${field}${issue.path.length ? `.${issue.path.join('.')}` : ''}: ${issue.message}`,
    )
    .join('; ');
}

function invalidOutboundConfig(message: string): BadRequestException {
  return new BadRequestException({ code: 'CATALOG_OUTBOUND_CONFIG_INVALID', message });
}

function revisionConflict(expected: number, current: number): ConflictException {
  return new ConflictException({
    code: 'CATALOG_REVISION_CONFLICT',
    message: `expected revision ${expected}, current revision is ${current}`,
  });
}

async function assertResourceKind(
  manager: EntityManager,
  resourceUid: string,
  expected: CatalogDocument['kind'],
): Promise<void> {
  const resource = await manager.getRepository(CatalogResource).findOneBy({
    resource_uid: resourceUid,
  });
  if (!resource || resource.kind !== expected) {
    throw new ConflictException(`Catalog resource is not a ${expected}: ${resourceUid}`);
  }
}

async function assertValidForkSource(
  manager: EntityManager,
  targetKind: CatalogDocument['kind'],
  fork: {
    forked_from_resource_uid?: string;
    forked_from_revision?: number;
  },
): Promise<void> {
  const resourceUid = fork.forked_from_resource_uid;
  const revisionNumber = fork.forked_from_revision;
  if (resourceUid === undefined && revisionNumber === undefined) return;
  if (resourceUid === undefined || revisionNumber === undefined) {
    throw new ConflictException('fork source uid and revision must be provided together');
  }
  const [source, revision] = await Promise.all([
    manager.getRepository(CatalogResource).findOneBy({ resource_uid: resourceUid }),
    manager.getRepository(CatalogResourceRevision).findOneBy({
      resource_uid: resourceUid,
      revision: revisionNumber,
    }),
  ]);
  if (!source || !revision) {
    throw new ConflictException(`fork source does not exist: ${resourceUid}@${revisionNumber}`);
  }
  if (source.kind !== targetKind) {
    throw new ConflictException(`cannot fork ${source.kind} as ${targetKind}`);
  }
}
