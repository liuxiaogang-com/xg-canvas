import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';

import { CurrentUser, type AuthUser } from '../common/decorators/current-user';
import { CreatePresetDto, UpdatePresetDto } from './dto/preset.dto';
import { PresetService } from './preset.service';

@Controller('presets')
export class PresetController {
  constructor(private readonly presets: PresetService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('task_type') taskType?: string) {
    return this.presets.listForUser(user.user_id, taskType);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePresetDto) {
    return this.presets.create(user.user_id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdatePresetDto) {
    return this.presets.update(user.user_id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.presets.remove(user.user_id, id);
  }
}
