import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { IsIn, IsUUID } from 'class-validator';
import { FAVORITE_TARGET_TYPES, type FavoriteTargetType } from '@xgcanvas/shared-types';

import { CurrentUser, type AuthUser } from '../common/decorators/current-user';
import { FavoriteService } from './favorite.service';

class AddFavoriteDto {
  @IsIn(FAVORITE_TARGET_TYPES)
  target_type: FavoriteTargetType;

  @IsUUID()
  target_id: string;
}

@Controller('favorites')
export class FavoriteController {
  constructor(private readonly favorites: FavoriteService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query('target_type') targetType?: string) {
    const type = parseTargetType(targetType);
    return { ids: await this.favorites.listIds(user.user_id, user.workspace_id, type) };
  }

  @Post()
  @HttpCode(204)
  async add(@CurrentUser() user: AuthUser, @Body() dto: AddFavoriteDto) {
    await this.favorites.add(user.user_id, user.workspace_id, dto.target_type, dto.target_id);
  }

  @Delete(':targetType/:targetId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('targetType') targetType: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
  ) {
    await this.favorites.remove(user.user_id, parseTargetType(targetType), targetId);
  }
}

function parseTargetType(value?: string): FavoriteTargetType {
  const candidate = value ?? 'asset';
  if (!(FAVORITE_TARGET_TYPES as readonly string[]).includes(candidate)) {
    throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'invalid favorite target_type' });
  }
  return candidate as FavoriteTargetType;
}
