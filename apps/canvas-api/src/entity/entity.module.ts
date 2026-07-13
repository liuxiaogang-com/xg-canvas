import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthzModule } from '../authz/authz.module';
import { AssetModule } from '../asset/asset.module';
import { CanvasEntity, Favorite } from '../database/entities';
import { LibraryModule } from '../library/library.module';
import { ProjectModule } from '../project/project.module';
import { EntityController } from './entity.controller';
import { EntityService } from './entity.service';

@Module({
  imports: [TypeOrmModule.forFeature([CanvasEntity, Favorite]), ProjectModule, AuthzModule, AssetModule, LibraryModule],
  controllers: [EntityController],
  providers: [EntityService],
  exports: [EntityService],
})
export class EntityModule {}
