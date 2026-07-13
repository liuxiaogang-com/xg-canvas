import { Global, Module } from '@nestjs/common';
import { StorageModule as AccountStorageModule } from '../account/storage/storage.module';
import { PresignedUrlService } from './presigned-url.service';

@Global()
@Module({
  imports: [AccountStorageModule],
  providers: [PresignedUrlService],
  exports: [PresignedUrlService],
})
export class StorageModule {}
