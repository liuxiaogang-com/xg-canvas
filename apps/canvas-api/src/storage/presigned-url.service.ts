import { Injectable } from '@nestjs/common';
import { ObjectStorageClient } from '../account/storage/object-storage.client';

const DEFAULT_TTL_SEC = 3600;

@Injectable()
export class PresignedUrlService {
  constructor(private readonly storage: ObjectStorageClient) {}

  getObject(storageKey: string, ttlSec = DEFAULT_TTL_SEC): Promise<string> {
    return this.storage.getObjectUrl(storageKey, ttlSec);
  }

  putObject(storageKey: string, ttlSec = DEFAULT_TTL_SEC, contentType?: string): Promise<string> {
    return this.storage.putObjectUrl(storageKey, ttlSec, contentType);
  }

  headObject(storageKey: string): Promise<{ size_bytes: number; mime_type?: string; etag?: string } | null> {
    return this.storage.headObject(storageKey);
  }

  deleteObject(storageKey: string): Promise<void> {
    return this.storage.deleteObject(storageKey);
  }

  copyObject(sourceKey: string, destinationKey: string, sourceEtag: string): Promise<void> {
    return this.storage.copyObject(sourceKey, destinationKey, sourceEtag);
  }

  bucket(): Promise<string> {
    return this.storage.bucket();
  }
}
