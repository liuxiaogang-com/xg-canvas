import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';

import { CurrentUser, type AuthUser } from '../common/decorators/current-user';
import type { CanvasEntity } from '../database/entities';
import { CreateEntityDto, UpdateEntityDto } from './dto/entity.dto';
import { EntityService } from './entity.service';

@Controller('entities')
export class EntityController {
  constructor(private readonly entities: EntityService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('project_id') projectId: string,
    @Query('type') type?: CanvasEntity['type'],
  ) {
    return this.entities.list(user.user_id, projectId, type);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEntityDto) {
    return this.entities.create(user.user_id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateEntityDto) {
    return this.entities.update(user.user_id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.entities.remove(user.user_id, id);
  }
}
