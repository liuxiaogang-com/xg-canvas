import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AdapterError, type InvokeCtx, wrapUnknownVendorError } from '@xgcanvas/adapters-contract';

import { AssetDownloaderService } from '../storage';
import { AdapterRegistry } from '../adapters/registry';
import { RequestLogService } from '../../request-log/request-log.service';
import { RegistryService } from '../registry';
import { ChannelResolverService } from './channel-resolver.service';
import { CredentialResolverService } from './credential-resolver.service';
import type { CancelRequestDto } from './dto/cancel-request.dto';

@Injectable()
export class CancelService {
  constructor(
    private readonly registry: RegistryService,
    private readonly adapters: AdapterRegistry,
    private readonly channels: ChannelResolverService,
    private readonly credentials: CredentialResolverService,
    private readonly downloader: AssetDownloaderService,
    private readonly requestLogs: RequestLogService,
  ) {}

  async cancel(dto: CancelRequestDto): Promise<void> {
    const snapshot = this.registry.getSnapshot();
    const entry = this.registry.requirePinnedEntry(dto, snapshot);
    const adapter = this.adapters.get(entry.manifest.adapter_key);
    if (!adapter.cancel) return; // best-effort
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
      downloader: this.downloader.forTask({
        workspaceId: dto.workspace_id,
        projectId: dto.project_id,
        taskId: dto.task_id,
      }),
      logger: console as never,
    };
    const requestId = randomUUID();
    const startedAt = Date.now();
    await this.requestLogs.record({
      id: requestId,
      logical_request_id: requestId,
      attempt_no: 1,
      source: 'cancel',
      operation: 'cancel',
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
    try {
      await adapter.cancel(dto.external_task_id, ctx);
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
    });
    assertFinalized(requestId, updated);
  }
}

function assertFinalized(requestId: string, updated: boolean): void {
  if (!updated) throw new Error(`pending cancel request log is missing: ${requestId}`);
}
