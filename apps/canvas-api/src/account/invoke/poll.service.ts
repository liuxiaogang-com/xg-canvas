import { Injectable } from '@nestjs/common';
import {
  AdapterError,
  type InvokeCtx,
  type PollResult,
  wrapUnknownVendorError,
} from '@xgcanvas/adapters-contract';

import { AssetDownloaderService } from '../storage';
import { RegistryService } from '../registry';
import { ChannelResolverService } from './channel-resolver.service';
import { CredentialResolverService } from './credential-resolver.service';
import type { PollRequestDto } from './dto/poll-request.dto';

@Injectable()
export class PollService {
  constructor(
    private readonly registry: RegistryService,
    private readonly channels: ChannelResolverService,
    private readonly credentials: CredentialResolverService,
    private readonly downloader: AssetDownloaderService,
  ) {}

  async poll(dto: PollRequestDto, signal?: AbortSignal): Promise<PollResult> {
    const adapter = this.registry.getAdapterFor(dto.model_id);
    if (!adapter.poll) {
      throw new AdapterError({
        code: 'ADAPTER_INTERNAL',
        message: `adapter ${adapter.key} does not support poll`,
      });
    }
    const channel = await this.channels.getById(dto.channel_id);
    const credential = await this.credentials.select(channel.id, dto.credential_id);
    const ctx: InvokeCtx = {
      task_id: dto.task_id,
      workspace_id: dto.workspace_id,
      project_id: dto.project_id,
      channel: { id: channel.id, key: channel.slug, base_url: channel.base_url, options: channel.request_config },
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
    try {
      return await adapter.poll(dto.external_task_id, ctx);
    } catch (e) {
      throw e instanceof AdapterError ? e : wrapUnknownVendorError(e);
    }
  }
}
