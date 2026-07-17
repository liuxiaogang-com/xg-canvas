import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AssetDownloaderService } from './asset-downloader.service';
import { EncryptionModule } from '../credential/encryption.module';
import { ObjectStorageClient } from './object-storage.client';
import { ObjectStorageController } from './object-storage.controller';
import { PresignedUrlService } from './presigned-url.service';
import { SmtpSettingsClient } from './smtp-settings.client';
import { SmtpSettingsController } from './smtp-settings.controller';
import { SystemSetting } from './system-setting.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SystemSetting]), EncryptionModule],
  controllers: [ObjectStorageController, SmtpSettingsController],
  providers: [ObjectStorageClient, AssetDownloaderService, PresignedUrlService, SmtpSettingsClient],
  exports: [ObjectStorageClient, AssetDownloaderService, PresignedUrlService, SmtpSettingsClient],
})
export class StorageModule {}
