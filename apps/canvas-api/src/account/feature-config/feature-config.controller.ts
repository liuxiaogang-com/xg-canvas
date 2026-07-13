import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { RequirePerm } from '../../authz/require-perm.decorator';

import { FeatureConfigService } from './feature-config.service';
import { UpsertFeatureConfigDto } from './feature-config.dto';

@Controller('admin/feature-configs')
export class FeatureConfigController {
  constructor(private readonly svc: FeatureConfigService) {}

  @Get()
  @RequirePerm('system.config.manage', { scope: 'system' })
  async list() {
    return this.svc.getAll();
  }

  @Get(':key')
  @RequirePerm('system.config.manage', { scope: 'system' })
  async get(@Param('key') key: string) {
    return this.svc.getByKey(key);
  }

  @Put(':key')
  @RequirePerm('system.config.manage', { scope: 'system' })
  async upsert(@Param('key') key: string, @Body() dto: UpsertFeatureConfigDto) {
    return this.svc.upsert(key, dto);
  }

  @Delete(':key')
  @RequirePerm('system.config.manage', { scope: 'system' })
  async delete(@Param('key') key: string) {
    await this.svc.delete(key);
    return { ok: true };
  }
}
