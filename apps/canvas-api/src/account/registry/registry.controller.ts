import { Controller, HttpCode, Post, Get } from '@nestjs/common';

import { RegistryBootstrapService } from './registry-bootstrap.service';
import { RegistryService } from './registry.service';
import { RequirePerm } from '../../authz/require-perm.decorator';

@RequirePerm('system.config.sync', { scope: 'system' })
@Controller('admin/registry')
export class RegistryController {
  constructor(
    private readonly bootstrap: RegistryBootstrapService,
    private readonly registry: RegistryService,
  ) {}

  @Post('reload')
  @HttpCode(200)
  async reload() {
    return this.bootstrap.reload();
  }

  @Get('snapshot')
  snapshot() {
    const snap = this.registry.getSnapshot();
    return {
      loaded_at: snap.loaded_at,
      models: Array.from(snap.byId.values()).map((e) => ({
        id: e.manifest.id,
        provider_key: e.manifest.provider_key,
        adapter_key: e.manifest.adapter_key,
        task_types: e.manifest.task_types,
        invocation_mode: e.manifest.invocation_mode,
      })),
    };
  }
}
