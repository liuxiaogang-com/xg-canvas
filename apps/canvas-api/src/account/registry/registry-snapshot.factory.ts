import { Injectable } from '@nestjs/common';
import { defineModel, type ModelManifestEntry } from '@xgcanvas/adapters-contract';
import {
  isCatalogCurrentLifecycle,
  validateNonSecretConfig,
  validateOutboundBaseUrl,
  type CatalogChannelTemplate,
  type CatalogModelOffering,
  type CatalogProvider,
  type CatalogRateCard,
} from '@xgcanvas/model-catalog';
import type { Capability, CatalogOrigin, TaskType } from '@xgcanvas/shared-types';
import type { EntityManager } from 'typeorm';
import { AdapterRegistry } from '../adapters/registry';
import { CatalogReadService } from '../catalog/catalog-read.service';
import { ChannelInstallation } from '../channel/channel-installation.entity';
import { ModelSettings } from '../model-definition/model-settings.entity';
import { ProviderInstallation } from '../provider/provider-installation.entity';
import {
  asVisibility,
  buildIndexes,
  compareResource,
  groupCredentials,
  parseModel,
  recordsOfKind,
  snapshotDigest,
  stripDates,
  withEpoch,
  type RevisionRow,
} from './registry-snapshot.helpers';
import {
  assertAdapterContract,
  assertChannelAdapterKeys,
  assertCurrentRateCardOwner,
  assertEnabledCredentialContracts,
  assertUniqueCurrentSlugs,
  buildRateCards,
  requireModelProvider,
  type EnabledCredentialSnapshotRow,
} from './registry-snapshot.integrity';
import { historyModelSql, historyRateSql } from './registry-snapshot.queries';
import type {
  CatalogRuntimeChannel,
  CatalogRuntimeProvider,
  CatalogRuntimeRateCard,
  ModelRegistryEntry,
  RegistrySnapshot,
} from './types';

@Injectable()
export class RegistrySnapshotFactory {
  constructor(
    private readonly adapters: AdapterRegistry,
    private readonly catalog: CatalogReadService,
  ) {}

  async build(manager: EntityManager): Promise<RegistrySnapshot> {
    const [state] = await manager.query<[{ catalog_epoch: string }]>(
      'SELECT catalog_epoch::text FROM account.catalog_runtime_state WHERE id = 1',
    );
    if (!state) throw new Error('Catalog runtime state is missing');

    const current = await this.catalog.listCurrent(undefined, manager);
    const providerSettings = await manager.getRepository(ProviderInstallation).find();
    const channelSettings = await manager.getRepository(ChannelInstallation).find();
    const modelSettings = await manager.getRepository(ModelSettings).find();
    const credentialRows = await manager.query<EnabledCredentialSnapshotRow[]>(
      `SELECT id, channel_resource_uid, credential_type, payload_fields
         FROM account.credentials
        WHERE enabled = true AND archived_at IS NULL`,
    );
    const historyModels = await manager.query<RevisionRow[]>(historyModelSql);
    const historyRates = await manager.query<RevisionRow[]>(historyRateSql);

    const currentProviders = recordsOfKind<CatalogProvider>(current, 'provider');
    const currentChannels = recordsOfKind<CatalogChannelTemplate>(current, 'channel_template');
    assertUniqueCurrentSlugs(currentProviders, currentChannels);
    assertEnabledCredentialContracts(
      credentialRows,
      new Map(currentChannels.map((record) => [record.document.resource_uid, record.document])),
      new Map(currentProviders.map((record) => [record.document.resource_uid, record.document])),
    );

    const currentByUid = new Map(current.map((record) => [record.document.resource_uid, record]));
    const providerSettingsByUid = new Map(
      providerSettings.map((row) => [row.provider_resource_uid, row]),
    );
    const channelSettingsByUid = new Map(
      channelSettings.map((row) => [row.channel_resource_uid, row]),
    );
    const modelSettingsByUid = new Map(modelSettings.map((row) => [row.model_resource_uid, row]));
    const credentialsByChannel = groupCredentials(credentialRows);

    const providersByResourceUid = new Map<string, CatalogRuntimeProvider>();
    for (const record of currentProviders) {
      const settings = providerSettingsByUid.get(record.document.resource_uid);
      if (!settings)
        throw new Error(`provider settings are missing: ${record.document.resource_uid}`);
      assertSafeOutboundOverrides(
        'provider',
        record.document.resource_uid,
        settings.config_overrides,
      );
      providersByResourceUid.set(record.document.resource_uid, {
        document: record.document,
        origin: record.origin,
        enabled: settings.enabled,
        sort_order: settings.sort_order,
        config_overrides: settings.config_overrides,
      });
    }

    const channelsByResourceUid = new Map<string, CatalogRuntimeChannel>();
    for (const record of currentChannels) {
      const settings = channelSettingsByUid.get(record.document.resource_uid);
      if (!settings)
        throw new Error(`channel settings are missing: ${record.document.resource_uid}`);
      assertSafeOutboundOverrides(
        'channel',
        record.document.resource_uid,
        settings.config_overrides,
      );
      const provider = providersByResourceUid.get(record.document.provider_uid);
      if (!provider)
        throw new Error(`channel references an unknown provider: ${record.document.slug}`);
      assertChannelAdapterKeys(record.document, provider.document);
      channelsByResourceUid.set(record.document.resource_uid, {
        document: record.document,
        origin: record.origin,
        enabled: settings.enabled,
        priority: settings.priority,
        config_overrides: settings.config_overrides,
        enabled_credential_ids: credentialsByChannel.get(record.document.resource_uid) ?? [],
      });
    }

    const rateCardsByRevisionId = buildRateCards(historyRates, currentByUid);
    const currentRateByUid = new Map<string, CatalogRuntimeRateCard>();
    for (const record of recordsOfKind<CatalogRateCard>(current, 'rate_card')) {
      if (!isCatalogCurrentLifecycle(record.document.lifecycle)) continue;
      assertCurrentRateCardOwner(record.document, currentByUid);
      const rate = rateCardsByRevisionId.get(record.origin.revision_id);
      if (!rate) throw new Error(`current Rate Card is unavailable: ${record.document.slug}`);
      currentRateByUid.set(record.document.resource_uid, rate);
    }

    const byRevisionId = new Map<string, ModelRegistryEntry>();
    for (const row of historyModels) {
      const document = parseModel(row);
      if (!isCatalogCurrentLifecycle(document.lifecycle)) continue;
      const currentResource = currentByUid.get(document.resource_uid);
      if (!currentResource) {
        throw new Error(
          `historical model resource is absent from the current Catalog: ${document.resource_uid}`,
        );
      }
      const provider = providersByResourceUid.get(document.provider_uid);
      if (!provider) {
        throw new Error(
          `historical model provider is absent from the current Catalog: ${document.provider_uid}`,
        );
      }
      if (
        currentResource.document.lifecycle === 'revoked' ||
        provider.document.lifecycle === 'revoked'
      )
        continue;
      byRevisionId.set(
        row.revision_id,
        this.makeEntry(row, document, provider.document.slug, state.catalog_epoch, undefined, null),
      );
    }

    const byId = new Map<string, ModelRegistryEntry>();
    for (const record of recordsOfKind<CatalogModelOffering>(current, 'model_offering')) {
      const document = record.document;
      if (!isCatalogCurrentLifecycle(document.lifecycle)) continue;
      const provider = requireModelProvider(
        document,
        providersByResourceUid,
        channelsByResourceUid,
      );
      const settings = modelSettingsByUid.get(document.resource_uid);
      if (!settings) throw new Error(`model settings are missing: ${document.model_id}`);
      const rate = document.rate_card_uid
        ? (currentRateByUid.get(document.rate_card_uid) ?? null)
        : null;
      if (document.rate_card_uid && !rate) {
        throw new Error(`model has no active Rate Card: ${document.model_id}`);
      }
      if (rate && rate.model_resource_uid !== document.resource_uid) {
        throw new Error(`Rate Card owner mismatch for model: ${document.model_id}`);
      }
      const entry = this.makeEntry(
        {
          revision_id: record.origin.revision_id,
          source_id: record.origin.source_id,
          source_kind: record.origin.kind,
          release_id: record.origin.release_id,
          content_digest: snapshotDigest(document),
          document,
        },
        document,
        provider.document.slug,
        state.catalog_epoch,
        { enabled: settings.enabled, visibility: settings.visibility },
        rate,
      );
      const collision = byId.get(document.model_id);
      if (collision && collision.origin.resource_uid !== document.resource_uid) {
        throw new Error(`active model_id collision: ${document.model_id}`);
      }
      byId.set(document.model_id, entry);
      byRevisionId.set(record.origin.revision_id, entry);
    }

    const { byTaskType, byProvider } = buildIndexes(byId.values());
    const contentDigest = snapshotDigest({
      current: current
        .map((record) => ({ document: record.document, origin: record.origin }))
        .sort(compareResource),
      provider_settings: providerSettings
        .map(stripDates)
        .sort((a, b) =>
          String(a.provider_resource_uid).localeCompare(String(b.provider_resource_uid)),
        ),
      channel_settings: channelSettings
        .map(stripDates)
        .sort((a, b) =>
          String(a.channel_resource_uid).localeCompare(String(b.channel_resource_uid)),
        ),
      model_settings: modelSettings
        .map(stripDates)
        .sort((a, b) => String(a.model_resource_uid).localeCompare(String(b.model_resource_uid))),
      enabled_credentials: credentialRows
        .map((row) => ({
          id: row.id,
          channel_resource_uid: row.channel_resource_uid,
          credential_type: row.credential_type,
          payload_fields: [...row.payload_fields],
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    });
    return {
      byId,
      byRevisionId,
      providersByResourceUid,
      channelsByResourceUid,
      rateCardsByRevisionId,
      byTaskType,
      byProvider,
      loaded_at: new Date().toISOString(),
      catalog_epoch: state.catalog_epoch,
      content_digest: contentDigest,
    };
  }

  withCatalogEpoch(snapshot: RegistrySnapshot, catalogEpoch: string): RegistrySnapshot {
    const byRevisionId = new Map(
      [...snapshot.byRevisionId].map(([id, entry]) => [id, withEpoch(entry, catalogEpoch)]),
    );
    const byId = new Map(
      [...snapshot.byId].map(([id, entry]) => [id, withEpoch(entry, catalogEpoch)]),
    );
    const { byTaskType, byProvider } = buildIndexes(byId.values());
    return { ...snapshot, byId, byRevisionId, byTaskType, byProvider, catalog_epoch: catalogEpoch };
  }

  private makeEntry(
    row: RevisionRow,
    document: CatalogModelOffering,
    providerKey: string,
    catalogEpoch: string,
    settings: { enabled: boolean; visibility: string } | undefined,
    rate: CatalogRuntimeRateCard | null,
  ): ModelRegistryEntry {
    assertAdapterContract(this.adapters, document);
    const manifest: ModelManifestEntry = {
      id: document.model_id,
      display_name: document.display_name,
      provider_key: providerKey,
      adapter_key: document.adapter_key,
      provider_model: document.provider_model_id,
      task_types: document.task_types as TaskType[],
      capabilities: document.capabilities as Capability[],
      invocation_mode: document.invocation_mode,
      param_schema: document.param_schema,
      input_contract: document.input_contract,
      constraints: document.param_constraints,
      poll_policy: document.poll_policy,
      enabled: settings?.enabled,
      visibility: settings ? asVisibility(settings.visibility) : undefined,
    };
    const origin: CatalogOrigin = {
      kind: row.source_kind,
      source_id: row.source_id,
      resource_uid: document.resource_uid,
      revision: document.revision,
      revision_id: row.revision_id,
      release_id: row.source_kind === 'official' ? row.release_id : null,
    };
    return {
      ...defineModel(manifest),
      document,
      origin,
      pin: {
        model_resource_uid: document.resource_uid,
        model_revision_id: row.revision_id,
        rate_card_revision_id: rate?.revision_id ?? null,
        catalog_epoch: catalogEpoch,
      },
      provider_resource_uid: document.provider_uid,
      rate_card_resource_uid: document.rate_card_uid ?? null,
      allowed_channel_resource_uids: document.allowed_channel_uids,
    };
  }
}

function assertSafeOutboundOverrides(
  kind: 'provider' | 'channel',
  resourceUid: string,
  overrides: Record<string, unknown>,
): void {
  if (Object.hasOwn(overrides, 'base_url')) {
    const value = overrides.base_url;
    const issues =
      typeof value === 'string' ? validateOutboundBaseUrl(value) : [{ message: 'not a string' }];
    if (issues.length > 0) {
      throw new Error(`${kind} ${resourceUid} has unsafe base_url override: ${issues[0].message}`);
    }
  }
  if (kind === 'channel' && Object.hasOwn(overrides, 'request_config')) {
    const value = overrides.request_config;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`channel ${resourceUid} has invalid request_config override`);
    }
    const issues = validateNonSecretConfig(value, 'request_config');
    if (issues.length > 0) {
      throw new Error(
        `channel ${resourceUid} has unsafe request_config override: ${issues[0].path.join('.')}`,
      );
    }
  }
  if (kind === 'provider' && Object.hasOwn(overrides, 'auth_config')) {
    const value = overrides.auth_config;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`provider ${resourceUid} has invalid auth_config override`);
    }
    const issues = validateNonSecretConfig(value, 'auth_config');
    if (issues.length > 0) {
      throw new Error(
        `provider ${resourceUid} has unsafe auth_config override: ${issues[0].path.join('.')}`,
      );
    }
  }
}
