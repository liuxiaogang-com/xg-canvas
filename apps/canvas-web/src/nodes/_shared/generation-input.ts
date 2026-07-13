import type { GenerationReference } from '@xgcanvas/shared-types';

/** Mode-based caps aligned with typical model input_contract defaults. */
const IMAGE_MODE_MAX: Record<string, number> = {
  image_to_image: 10,
};

const VIDEO_MODE_CAPS: Record<string, { images?: number; videos?: number; audio?: number }> = {
  image_to_video: { images: 1 },
  first_last_frame: { images: 2 },
  reference_to_video: { images: 9, videos: 3, audio: 3 },
  audio_driven_video: { images: 9, audio: 3 },
};

export function mapImageReferences(
  mode: string,
  upstream: GenerationReference[] | undefined,
  maxOverride?: number,
): GenerationReference[] {
  if (mode === 'text_to_image') return [];
  const max = maxOverride ?? IMAGE_MODE_MAX[mode] ?? 10;
  return imageLike(upstream)
    .slice(0, max)
    .map((ref, index) => ({
      ...ref,
      slot: mode === 'image_to_image' ? 'source_image' : 'reference_image',
      order: index,
    }));
}

export function mapVideoReferences(
  mode: string,
  upstream: GenerationReference[] | undefined,
  capsOverride?: { images?: number; videos?: number; audio?: number },
): GenerationReference[] {
  const media = upstream ?? [];
  const caps = capsOverride ?? VIDEO_MODE_CAPS[mode] ?? {};
  const images = imageLike(media).slice(0, caps.images ?? 9);
  const audio = media
    .filter((r) => r.type === 'audio' || r.slot === 'driving_audio')
    .slice(0, caps.audio ?? 3);
  const videos = media
    .filter((r) => r.type === 'video' || r.slot === 'source_video')
    .slice(0, caps.videos ?? 3);

  if (mode === 'image_to_video') return remapFirst(images, 'source_image');
  if (mode === 'first_last_frame') {
    return images.slice(0, 2).map((ref, index) => ({
      ...ref,
      slot: index === 0 ? 'first_frame' : 'last_frame',
      order: index,
    }));
  }
  if (mode === 'reference_to_video' || mode === 'audio_driven_video') {
    return [
      ...images.map((ref, index) => ({ ...ref, slot: 'reference_image', order: index })),
      ...videos.map((ref, index) => ({ ...ref, slot: 'source_video', order: images.length + index })),
      ...audio.map((ref, index) => ({
        ...ref,
        slot: 'driving_audio',
        order: images.length + videos.length + index,
      })),
    ];
  }
  return [];
}

function imageLike(refs: GenerationReference[] | undefined): GenerationReference[] {
  return (refs ?? []).filter((r) => r.type === undefined || r.type === 'image' || r.type === 'image_list');
}

function remapFirst(refs: GenerationReference[], slot: string): GenerationReference[] {
  return refs.slice(0, 1).map((ref) => ({ ...ref, slot, order: 0 }));
}
