import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AdapterError,
  type InvokeCtx,
  type PollResult,
  wrapUnknownVendorError,
} from '@xgcanvas/adapters-contract';

import { AssetDownloaderService } from '../storage';
import { AdapterRegistry } from '../adapters/registry';
import { RequestLogService } from '../../request-log/request-log.service';
import { RegistryService } from '../registry';
import { ChannelResolverService } from './channel-resolver.service';
import { CredentialResolverService } from './credential-resolver.service';
import type { PollRequestDto } from './dto/poll-request.dto';

@Injectable()
export class PollService {
  constructor(
    private readonly registry: RegistryService,
    private readonly adapters: AdapterRegistry,
    private readonly channels: ChannelResolverService,
    private readonly credentials: CredentialResolverService,
    private readonly downloader: AssetDownloaderService,
    private readonly requestLogs: RequestLogService,
  ) {}

  async poll(dto: PollRequestDto, signal?: AbortSignal): Promise<PollResult> {
    const snapshot = this.registry.getSnapshot();
    const entry = this.registry.requirePinnedEntry(dto, snapshot);
    const adapter = this.adapters.get(entry.manifest.adapter_key);
    if (!adapter.poll) {
      throw new AdapterError({
        code: 'ADAPTER_INTERNAL',
        message: `adapter ${adapter.key} does not support poll`,
      });
    }
    const selection = {
      model_id: entry.manifest.id,
      model_resource_uid: entry.pin.model_resource_uid,
      model_revision_id: entry.pin.model_revision_id,
      provider_resource_uid: entry.provider_resource_uid,
      adapter_key: entry.manifest.adapter_key,
      allowed_channel_resource_uids: entry.allowed_channel_resource_uids,
      historical: true as const,
    };
    const channel = await this.channels.getHistoricalRoute(
      selection,
      dto.channel_resource_uid,
      dto.channel_revision_id,
      dto.channel_route,
      snapshot,
    );
    const credential = await this.credentials.selectHistorical(
      channel.resource_uid,
      dto.credential_id,
    );
    const ctx: InvokeCtx = {
      task_id: dto.task_id,
      workspace_id: dto.workspace_id,
      project_id: dto.project_id,
      channel: {
        resource_uid: channel.resource_uid,
        key: channel.slug,
        base_url: channel.base_url,
        options: channel.request_config,
      },
      credential,
      signal,
      downloader: this.downloader.forTask({
        workspaceId: dto.workspace_id,
        projectId: dto.project_id,
        taskId: dto.task_id,
        signal,
      }),
      logger: console as never,
    };
    const requestId = randomUUID();
    const startedAt = Date.now();
    await this.requestLogs.record({
      id: requestId,
      logical_request_id: requestId,
      attempt_no: 1,
      source: 'poll',
      operation: 'poll',
      owner_id: dto.owner_id ?? null,
      workspace_id: dto.workspace_id,
      project_id: dto.project_id ?? null,
      task_id: dto.task_id,
      provider_slug: entry.manifest.provider_key,
      model_id: entry.manifest.id,
      model_resource_uid: dto.model_resource_uid,
      model_revision_id: dto.model_revision_id,
      rate_card_revision_id: null,
      catalog_epoch: dto.catalog_epoch,
      adapter_key: entry.manifest.adapter_key,
      channel_resource_uid: channel.resource_uid,
      channel_revision_id: channel.revision_id,
      channel_route: dto.channel_route,
      credential_id: credential.id,
      status: 'pending',
      request_summary: { external_task_id: dto.external_task_id },
    });
    let result: PollResult;
    try {
      result = await adapter.poll(dto.external_task_id, ctx);
    } catch (e) {
      const error = e instanceof AdapterError ? e : wrapUnknownVendorError(e);
      const updated = await this.requestLogs.finalizePending(requestId, {
        status: 'error',
        latency_ms: Date.now() - startedAt,
        http_status: error.httpStatus ?? null,
        error_code: error.code,
        error_message: error.message,
        vendor_error: error.vendor ?? null,
      });
      assertFinalized(requestId, updated);
      throw error;
    }
    const updated = await this.requestLogs.finalizePending(requestId, {
      status: 'success',
      latency_ms: Date.now() - startedAt,
      usage: result.response.usage as Record<string, unknown> | undefined,
      response_body: {
        status: result.response.status,
        progress: result.response.progress ?? null,
      },
    });
    assertFinalized(requestId, updated);
    return result;
  }
}

function assertFinalized(requestId: string, updated: boolean): void {
  if (!updated) throw new Error(`pending poll request log is missing: ${requestId}`);
}
