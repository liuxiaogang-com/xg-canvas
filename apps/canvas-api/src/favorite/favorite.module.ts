import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Favorite } from '../database/entities';
import { AssetModule } from '../asset/asset.module';
import { EntityModule } from '../entity/entity.module';
import { LibraryModule } from '../library/library.module';
import { FavoriteController } from './favorite.controller';
import { FavoriteService } from './favorite.service';

@Module({
  imports: [TypeOrmModule.forFeature([Favorite]), AssetModule, LibraryModule, EntityModule],
  controllers: [FavoriteController],
  providers: [FavoriteService],
  exports: [FavoriteService],
})
export class FavoriteModule {}
