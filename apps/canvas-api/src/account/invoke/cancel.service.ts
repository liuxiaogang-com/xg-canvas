import { Injectable } from '@nestjs/common';
import {
  AdapterError,
  type InvokeCtx,
  wrapUnknownVendorError,
} from '@xgcanvas/adapters-contract';

import { AssetDownloaderService } from '../storage';
import { RegistryService } from '../registry';
import { ChannelResolverService } from './channel-resolver.service';
import { CredentialResolverService } from './credential-resolver.service';
import type { CancelRequestDto } from './dto/cancel-request.dto';

@Injectable()
export class CancelService {
  constructor(
    private readonly registry: RegistryService,
    private readonly channels: ChannelResolverService,
    private readonly credentials: CredentialResolverService,
    private readonly downloader: AssetDownloaderService,
  ) {}

  async cancel(dto: CancelRequestDto): Promise<void> {
    const adapter = this.registry.getAdapterFor(dto.model_id);
    if (!adapter.cancel) return; // best-effort
    const channel = await this.channels.getById(dto.channel_id);
    const credential = await this.credentials.select(channel.id, dto.credential_id);
    const ctx: InvokeCtx = {
      task_id: 'cancel',
      workspace_id: '00000000-0000-0000-0000-000000000000',
      channel: { id: channel.id, key: channel.slug, base_url: channel.base_url, options: channel.request_config },
      credential,
      downloader: this.downloader.forTask({
        workspaceId: '00000000-0000-0000-0000-000000000000',
        taskId: 'cancel',
      }),
      logger: console as never,
    };
    try {
      await adapter.cancel(dto.external_task_id, ctx);
    } catch (e) {
      throw e instanceof AdapterError ? e : wrapUnknownVendorError(e);
    }
  }
}
