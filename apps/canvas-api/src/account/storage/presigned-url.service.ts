import { Injectable } from '@nestjs/common';

import { ObjectStorageClient } from './object-storage.client';

const DEFAULT_TTL_SEC = 3600; // 1 hour

@Injectable()
export class PresignedUrlService {
  constructor(private readonly storage: ObjectStorageClient) {}

  /** Mint a temporary GET url for a stored object. Never persisted. */
  async getObjectUrl(storageKey: string, ttlSec = DEFAULT_TTL_SEC): Promise<string> {
    return this.storage.getObjectUrl(storageKey, ttlSec);
  }

  /** Upload-side url; used by canvas-api for direct uploads. */
  async putObjectUrl(storageKey: string, ttlSec = DEFAULT_TTL_SEC): Promise<string> {
    return this.storage.putObjectUrl(storageKey, ttlSec);
  }
}
