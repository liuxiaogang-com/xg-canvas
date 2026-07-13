import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { FavoriteTargetType } from '@xgcanvas/shared-types';
import { AssetService } from '../asset/asset.service';
import { Favorite } from '../database/entities';
import { EntityService } from '../entity/entity.service';
import { LibraryService } from '../library/library.service';

@Injectable()
export class FavoriteService {
  constructor(
    @InjectRepository(Favorite) private readonly favorites: Repository<Favorite>,
    private readonly assets: AssetService,
    private readonly library: LibraryService,
    private readonly entities: EntityService,
  ) {}

  async add(userId: string, workspaceId: string, targetType: FavoriteTargetType, targetId: string): Promise<void> {
    await this.assertReadable(userId, workspaceId, targetType, targetId);
    await this.favorites
      .createQueryBuilder()
      .insert()
      .values({ user_id: userId, target_type: targetType, target_id: targetId })
      .orIgnore()
      .execute();
  }

  async remove(userId: string, targetType: FavoriteTargetType, targetId: string): Promise<void> {
    await this.favorites.delete({ user_id: userId, target_type: targetType, target_id: targetId });
  }

  async listIds(userId: string, workspaceId: string, targetType: FavoriteTargetType): Promise<string[]> {
    const rows = await this.favorites.find({
      where: { user_id: userId, target_type: targetType },
      order: { created_at: 'DESC' },
      take: 500,
    });
    const readable: string[] = [];
    for (const row of rows) {
      try {
        await this.assertReadable(userId, workspaceId, targetType, row.target_id);
        readable.push(row.target_id);
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
      }
    }
    return readable;
  }

  private async assertReadable(
    userId: string,
    workspaceId: string,
    targetType: FavoriteTargetType,
    targetId: string,
  ): Promise<void> {
    try {
      if (targetType === 'asset') {
        await this.assets.getInWorkspaceOrThrow(userId, targetId, workspaceId);
      } else if (targetType === 'library_entry') {
        await this.library.getInWorkspaceOrThrow(userId, targetId, workspaceId);
      } else {
        await this.entities.getInWorkspaceOrThrow(userId, targetId, workspaceId);
      }
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'favorite target not found' });
      }
      throw error;
    }
  }
}
