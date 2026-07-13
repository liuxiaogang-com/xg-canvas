import { Controller, Post, Get, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigSyncService, SyncResult } from './config-sync.service';
import { RequirePerm } from '../../authz/require-perm.decorator';

@ApiTags('Config Sync')
@RequirePerm('system.config.sync', { scope: 'system' })
@Controller('admin/config-sync')
export class ConfigSyncController {
  private lastSyncResult: SyncResult | null = null;
  private syncing = false;
  private lastSyncAt: Date | null = null;

  constructor(private readonly configSyncService: ConfigSyncService) {}

  @Post('sync')
  async sync(
    @Body() body?: { config_dir?: string; dry_run?: boolean },
  ): Promise<{ status: string; result: SyncResult }> {
    if (this.syncing) {
      return {
        status: 'already_running',
        result: this.lastSyncResult!,
      };
    }

    this.syncing = true;
    try {
      const result = await this.configSyncService.syncFromConfig(
        body?.config_dir,
        body?.dry_run ?? false,
      );
      this.lastSyncResult = result;
      this.lastSyncAt = new Date();
      return { status: 'completed', result };
    } finally {
      this.syncing = false;
    }
  }

  @Get('status')
  getStatus() {
    return {
      syncing: this.syncing,
      last_sync_at: this.lastSyncAt,
      last_result: this.lastSyncResult,
    };
  }
}
