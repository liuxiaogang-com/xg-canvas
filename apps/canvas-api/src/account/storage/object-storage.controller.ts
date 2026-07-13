import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { RequirePerm } from '../../authz/require-perm.decorator';
import { ObjectStorageClient } from './object-storage.client';
import { UpdateObjectStorageDto } from './object-storage.dto';

@Controller('admin/system-settings/object-storage')
export class ObjectStorageController {
  constructor(private readonly storage: ObjectStorageClient) {}

  @Get()
  @RequirePerm('system.config.manage', { scope: 'system' })
  get() {
    return this.storage.getSettingsView();
  }

  @Put()
  @RequirePerm('system.config.manage', { scope: 'system' })
  update(@Body() dto: UpdateObjectStorageDto) {
    return this.storage.updateSettings(dto);
  }

  @Post('test')
  @RequirePerm('system.config.manage', { scope: 'system' })
  async test(@Body() dto: UpdateObjectStorageDto) {
    const view = await this.storage.testSettings(dto);
    return { ok: true as const, ...view };
  }
}
