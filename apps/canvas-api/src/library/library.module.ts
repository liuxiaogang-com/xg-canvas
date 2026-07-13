import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthzModule } from '../authz/authz.module';
import { AssetModule } from '../asset/asset.module';
import { LibraryEntry, Project } from '../database/entities';
import { WorkspaceModule } from '../workspace/workspace.module';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';

@Module({
  imports: [TypeOrmModule.forFeature([LibraryEntry, Project]), WorkspaceModule, AuthzModule, AssetModule],
  controllers: [LibraryController],
  providers: [LibraryService],
  exports: [LibraryService],
})
export class LibraryModule {}
