import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthzModule } from '../authz/authz.module';
import { Asset, AssetUploadDraft, Project } from '../database/entities';
import { WorkspaceModule } from '../workspace/workspace.module';
import { AssetController } from './asset.controller';
import { AssetService } from './asset.service';
import { AssetUploadService } from './asset-upload.service';
import { AssetUploadCleanupService } from './asset-upload-cleanup.service';

@Module({
  imports: [TypeOrmModule.forFeature([Asset, AssetUploadDraft, Project]), WorkspaceModule, AuthzModule],
  controllers: [AssetController],
  providers: [AssetService, AssetUploadService, AssetUploadCleanupService],
  exports: [AssetService],
})
export class AssetModule {}
