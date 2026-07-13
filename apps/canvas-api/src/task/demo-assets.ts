import type { StorageDescriptor } from '@xgcanvas/shared-types';

const BUCKET = 'xgcanvas-assets';

export const DEMO_IMAGE_STORAGE: StorageDescriptor = {
  storage_key: 'demo/placeholder.svg',
  bucket: BUCKET,
  size_bytes: 2048,
  mime_type: 'image/svg+xml',
  sha256: 'demo-placeholder-image',
  width: 1024,
  height: 1024,
};

export const DEMO_VIDEO_STORAGE: StorageDescriptor = {
  storage_key: 'demo/placeholder.mp4',
  bucket: BUCKET,
  size_bytes: 4096,
  mime_type: 'video/mp4',
  sha256: 'demo-placeholder-video',
  width: 1920,
  height: 1080,
  duration_ms: 5000,
};

export const DEMO_AUDIO_STORAGE: StorageDescriptor = {
  storage_key: 'demo/placeholder.mp3',
  bucket: BUCKET,
  size_bytes: 3072,
  mime_type: 'audio/mpeg',
  sha256: 'demo-placeholder-audio',
  duration_ms: 30000,
};
