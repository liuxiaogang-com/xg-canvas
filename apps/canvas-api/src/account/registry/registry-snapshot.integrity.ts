import {
  isCatalogCurrentLifecycle,
  type CatalogChannelTemplate,
  type CatalogModelOffering,
  type CatalogProvider,
  type CatalogRateCard,
} from '@xgcanvas/model-catalog';
import type { AdapterRegistry } from '../adapters/registry';
import type { CatalogRecord } from '../catalog/catalog-read.service';
import { assertCredentialContract } from '../credential/credential-contract';
import { parseRate, type RevisionRow } from './registry-snapshot.helpers';
import type {
  CatalogRuntimeChannel,
  CatalogRuntimeProvider,
  CatalogRuntimeRateCard,
} from './types';

export interface EnabledCredentialSnapshotRow {
  id: string;
  channel_resource_uid: string;
  credential_type: string;
  payload_fields: readonly string[];
}

export function assertEnabledCredentialContracts(
  credentials: readonly EnabledCredentialSnapshotRow[],
  channelsByResourceUid: ReadonlyMap<string, CatalogChannelTemplate>,
  providersByResourceUid: ReadonlyMap<string, CatalogProvider>,
): void {
  for (const credential of credentials) {
    const channel = channelsByResourceUid.get(credential.channel_resource_uid);
    if (!channel || !isCatalogCurrentLifecycle(channel.lifecycle)) {
      throw new Error(
        `enabled credential ${credential.id} references unavailable current channel ` +
          credential.channel_resource_uid,
      );
    }
    const provider = providersByResourceUid.get(channel.provider_uid);
    if (!provider || !isCatalogCurrentLifecycle(provider.lifecycle)) {
      throw new Error(
        `enabled credential ${credential.id} channel ${channel.resource_uid} references ` +
          `unavailable current provider ${channel.provider_uid}`,
      );
    }
    const fields = credential.payload_fields;
    if (
      !Array.isArray(fields) ||
      fields.some((field) => typeof field !== 'string') ||
      new Set(fields).size !== fields.length
    ) {
      throw new Error(`enabled credential ${credential.id} has invalid payload_fields metadata`);
    }
    const markerPayload = Object.fromEntries(
      fields.map((field) => [field, field === 'api_key' ? 'snapshot-marker' : true]),
    );
    try {
      assertCredentialContract(
        provider.auth_method,
        credential.credential_type,
        markerPayload,
      );
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `enabled credential ${credential.id} does not match provider ${provider.slug} ` +
          `auth_method ${provider.auth_method}: ${detail}`,
      );
    }
  }
}

export function assertUniqueCurrentSlugs(
  providers: readonly CatalogRecord<CatalogProvider>[],
  channels: readonly CatalogRecord<CatalogChannelTemplate>[],
): void {
  const providerBySlug = new Map<string, CatalogRecord<CatalogProvider>>();
  for (const record of providers) {
    const collision = providerBySlug.get(record.document.slug);
    if (collision && collision.document.resource_uid !== record.document.resource_uid) {
      throw new Error(
        `provider slug collision across catalog sources: ${record.document.slug} ` +
          `(${collision.document.resource_uid}, ${record.document.resource_uid})`,
      );
    }
    providerBySlug.set(record.document.slug, record);
  }

  const channelByProviderAndSlug = new Map<string, CatalogRecord<CatalogChannelTemplate>>();
  for (const record of channels) {
    const key = `${record.document.provider_uid}\u0000${record.document.slug}`;
    const collision = channelByProviderAndSlug.get(key);
    if (collision && collision.document.resource_uid !== record.document.resource_uid) {
      throw new Error(
        `channel slug collision for provider ${record.document.provider_uid}: ` +
          `${record.document.slug} ` +
          `(${collision.document.resource_uid}, ${record.document.resource_uid})`,
      );
    }
    channelByProviderAndSlug.set(key, record);
  }
}

export function assertChannelAdapterKeys(
  channel: CatalogChannelTemplate,
  provider: CatalogProvider,
): void {
  const unsupportedAdapters = channel.adapter_keys.filter(
    (key) => !provider.adapter_keys.includes(key),
  );
  if (unsupportedAdapters.length > 0) {
    throw new Error(
      `channel ${channel.slug} uses adapters not declared by provider: ` +
        unsupportedAdapters.join(', '),
    );
  }
}

export function requireModelProvider(
  document: CatalogModelOffering,
  providersByResourceUid: ReadonlyMap<string, CatalogRuntimeProvider>,
  channelsByResourceUid: ReadonlyMap<string, CatalogRuntimeChannel>,
): CatalogRuntimeProvider {
  const provider = providersByResourceUid.get(document.provider_uid);
  if (!provider || !isCatalogCurrentLifecycle(provider.document.lifecycle)) {
    throw new Error(`model references an unavailable provider: ${document.model_id}`);
  }
  if (!provider.document.adapter_keys.includes(document.adapter_key)) {
    throw new Error(
      `model ${document.model_id} uses adapter ${document.adapter_key} not declared by provider`,
    );
  }
  if (document.allowed_channel_uids.length === 0) {
    throw new Error(`model ${document.model_id} has no explicitly allowed channel`);
  }
  for (const channelUid of document.allowed_channel_uids) {
    const channel = channelsByResourceUid.get(channelUid);
    if (
      !channel ||
      channel.document.provider_uid !== document.provider_uid ||
      !isCatalogCurrentLifecycle(channel.document.lifecycle) ||
      !channel.document.adapter_keys.includes(document.adapter_key)
    ) {
      throw new Error(`model ${document.model_id} references an unavailable channel`);
    }
  }
  return provider;
}

export function assertAdapterContract(
  adapters: AdapterRegistry,
  document: CatalogModelOffering,
): void {
  if (!adapters.has(document.adapter_key)) {
    throw new Error(
      `model ${document.model_id} references unknown adapter ${document.adapter_key}`,
    );
  }
  const adapter = adapters.get(document.adapter_key);
  const unsupported = document.task_types.filter(
    (taskType) => !adapter.capabilities.includes(taskType),
  );
  if (unsupported.length > 0) {
    throw new Error(`adapter ${document.adapter_key} does not support ${unsupported.join(', ')}`);
  }
  if ((document.invocation_mode === 'stream' || document.supports_streaming) && !adapter.stream) {
    throw new Error(`adapter ${document.adapter_key} does not implement streaming`);
  }
  if (document.invocation_mode === 'async' && !adapter.poll) {
    throw new Error(`adapter ${document.adapter_key} does not implement polling`);
  }
}

export function buildRateCards(
  rows: readonly RevisionRow[],
  currentByUid: ReadonlyMap<string, CatalogRecord>,
): Map<string, CatalogRuntimeRateCard> {
  const result = new Map<string, CatalogRuntimeRateCard>();
  for (const row of rows) {
    const rate: CatalogRateCard = parseRate(row);
    if (!isCatalogCurrentLifecycle(rate.lifecycle)) continue;
    const current = currentByUid.get(rate.resource_uid);
    if (!current) {
      throw new Error(
        `historical Rate Card resource is absent from the current Catalog: ${rate.resource_uid}`,
      );
    }
    if (current.document.lifecycle === 'revoked') continue;
    result.set(row.revision_id, {
      resource_uid: rate.resource_uid,
      model_resource_uid: rate.model_uid,
      revision: rate.revision,
      revision_id: row.revision_id,
      pricing: rate.pricing,
    });
  }
  return result;
}

export function assertCurrentRateCardOwner(
  rate: CatalogRateCard,
  currentByUid: ReadonlyMap<string, CatalogRecord>,
): void {
  const owner = currentByUid.get(rate.model_uid);
  if (
    !owner ||
    owner.document.kind !== 'model_offering' ||
    !isCatalogCurrentLifecycle(owner.document.lifecycle) ||
    owner.document.rate_card_uid !== rate.resource_uid
  ) {
    throw new Error(
      `active Rate Card ${rate.resource_uid} is not linked by its current Model ${rate.model_uid}`,
    );
  }
}
