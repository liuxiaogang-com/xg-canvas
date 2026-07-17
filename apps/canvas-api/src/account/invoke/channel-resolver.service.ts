import { Injectable } from '@nestjs/common';
import { AdapterError } from '@xgcanvas/adapters-contract';
import {
  isCatalogCurrentLifecycle,
  validateNonSecretConfig,
  validateOutboundBaseUrl,
  type CatalogChannelTemplate,
} from '@xgcanvas/model-catalog';
import { ERROR_CODES, type ChannelRouteSnapshot } from '@xgcanvas/shared-types';
import { CatalogReadService } from '../catalog/catalog-read.service';
import { RegistryService } from '../registry';
import type { RegistrySnapshot } from '../registry/types';

export interface ChannelModelSelection {
  model_id: string;
  model_resource_uid: string;
  model_revision_id: string;
  provider_resource_uid: string;
  adapter_key: string;
  allowed_channel_resource_uids: readonly string[];
  historical: boolean;
}

export interface ResolvedChannel {
  resource_uid: string;
  revision_id: string;
  slug: string;
  base_url?: string;
  request_config: Record<string, unknown>;
  priority: number;
}

@Injectable()
export class ChannelResolverService {
  constructor(
    private readonly registry: RegistryService,
    private readonly catalog: CatalogReadService,
  ) {}

  async select(
    selection: ChannelModelSelection,
    pinnedChannelResourceUid?: string,
    snapshot: RegistrySnapshot = this.registry.getSnapshot(),
  ): Promise<ResolvedChannel> {
    return (await this.listCandidates(selection, pinnedChannelResourceUid, snapshot))[0];
  }

  async listCandidates(
    selection: ChannelModelSelection,
    pinnedChannelResourceUid?: string,
    snapshot: RegistrySnapshot = this.registry.getSnapshot(),
  ): Promise<ResolvedChannel[]> {
    const entry = this.registry.getEntry(selection.model_id, snapshot);
    const provider = this.registry.getProvider(selection.provider_resource_uid, snapshot);
    if (!provider) throw unavailable(`provider installation not found: ${selection.model_id}`);
    if (
      !selection.historical &&
      (!entry ||
        entry.pin.model_resource_uid !== selection.model_resource_uid ||
        entry.pin.model_revision_id !== selection.model_revision_id ||
        !entry.manifest.enabled ||
        !provider.enabled)
    ) {
      throw new AdapterError({
        code: ERROR_CODES.MODEL_DISABLED,
        message: `model disabled: ${selection.model_id}`,
      });
    }

    const allowed = new Set(selection.allowed_channel_resource_uids);
    if (allowed.size === 0) {
      throw unavailable(`model has no explicitly allowed channel: ${selection.model_id}`);
    }
    const candidates = [...snapshot.channelsByResourceUid.values()]
      .filter(
        (channel) =>
          channel.document.provider_uid === selection.provider_resource_uid &&
          channel.enabled &&
          isCatalogCurrentLifecycle(channel.document.lifecycle) &&
          allowed.has(channel.document.resource_uid) &&
          channel.document.adapter_keys.includes(selection.adapter_key) &&
          (!pinnedChannelResourceUid || channel.document.resource_uid === pinnedChannelResourceUid),
      )
      .map(
        (channel): ResolvedChannel => ({
          resource_uid: channel.document.resource_uid,
          revision_id: channel.origin.revision_id,
          slug: channel.document.slug,
          base_url:
            stringValue(channel.config_overrides.base_url) ??
            channel.document.base_url ??
            stringValue(provider.config_overrides.base_url) ??
            provider.document.base_url,
          request_config:
            objectValue(channel.config_overrides.request_config) ?? channel.document.request_config,
          priority: channel.priority,
        }),
      )
      .sort(
        (a, b) =>
          a.priority - b.priority ||
          (a.resource_uid < b.resource_uid ? -1 : a.resource_uid > b.resource_uid ? 1 : 0),
      );
    if (candidates.length === 0) {
      throw unavailable(
        pinnedChannelResourceUid
          ? `pinned channel unavailable: ${pinnedChannelResourceUid}`
          : `no enabled channel for provider of ${selection.model_id}`,
      );
    }
    return candidates;
  }

  async getByResourceUid(resourceUid: string): Promise<ResolvedChannel> {
    const snapshot = this.registry.getSnapshot();
    const channel = this.registry.getChannel(resourceUid, snapshot);
    if (!channel) throw unavailable(`channel not found: ${resourceUid}`);
    const provider = this.registry.getProvider(channel.document.provider_uid, snapshot);
    if (!provider) throw unavailable(`channel provider not found: ${resourceUid}`);
    return {
      resource_uid: channel.document.resource_uid,
      revision_id: channel.origin.revision_id,
      slug: channel.document.slug,
      base_url:
        stringValue(channel.config_overrides.base_url) ??
        channel.document.base_url ??
        stringValue(provider.config_overrides.base_url) ??
        provider.document.base_url,
      request_config:
        objectValue(channel.config_overrides.request_config) ?? channel.document.request_config,
      priority: channel.priority,
    };
  }

  /** Exact route for poll/cancel; ignores runtime enablement after the Task was dispatched. */
  async getHistoricalRoute(
    selection: ChannelModelSelection,
    resourceUid: string,
    revisionId: string,
    route: ChannelRouteSnapshot,
    snapshot: RegistrySnapshot = this.registry.getSnapshot(),
  ): Promise<ResolvedChannel> {
    const current = this.registry.getChannel(resourceUid, snapshot);
    const allowed = new Set(selection.allowed_channel_resource_uids);
    if (
      !current ||
      current.document.lifecycle === 'revoked' ||
      current.document.provider_uid !== selection.provider_resource_uid ||
      !allowed.has(resourceUid)
    ) {
      throw unavailable(`historical channel does not match pinned model: ${resourceUid}`);
    }
    const revision = await this.catalog.findRevision<CatalogChannelTemplate>(revisionId);
    if (
      !revision ||
      revision.document.kind !== 'channel_template' ||
      revision.document.resource_uid !== resourceUid ||
      revision.document.provider_uid !== selection.provider_resource_uid ||
      !revision.document.adapter_keys.includes(selection.adapter_key) ||
      revision.document.lifecycle === 'revoked'
    ) {
      throw unavailable(`historical channel revision is unavailable: ${revisionId}`);
    }
    assertRouteSnapshot(route);
    return {
      resource_uid: resourceUid,
      revision_id: revisionId,
      slug: route.key,
      base_url: route.base_url,
      request_config: route.options,
      priority: 0,
    };
  }
}

export function snapshotChannelRoute(channel: ResolvedChannel): ChannelRouteSnapshot {
  const route: ChannelRouteSnapshot = {
    key: channel.slug,
    ...(channel.base_url ? { base_url: channel.base_url } : {}),
    options: structuredClone(channel.request_config),
  };
  assertRouteSnapshot(route);
  return route;
}

function assertRouteSnapshot(route: ChannelRouteSnapshot): void {
  if (
    !route ||
    typeof route.key !== 'string' ||
    route.key.length === 0 ||
    (route.base_url !== undefined && typeof route.base_url !== 'string') ||
    !route.options ||
    typeof route.options !== 'object' ||
    Array.isArray(route.options)
  ) {
    throw unavailable('historical channel route snapshot is invalid');
  }
  if (route.base_url) {
    const issues = validateOutboundBaseUrl(route.base_url);
    if (issues.length > 0) {
      throw unavailable(`historical channel route URL is unsafe: ${issues[0].message}`);
    }
  }
  const configIssues = validateNonSecretConfig(route.options, 'channel route options');
  if (configIssues.length > 0) {
    throw unavailable(
      `historical channel route options are unsafe: ${configIssues[0].path.join('.')}`,
    );
  }
}

function unavailable(message: string): AdapterError {
  return new AdapterError({ code: ERROR_CODES.CHANNEL_UNAVAILABLE, message });
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
