import { BadRequestException } from '@nestjs/common';
import { ASSET_TYPES, type AssetType } from '@xgcanvas/shared-types';

import type { AssetUploadDraft } from '../database/entities';

export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;
export const MAX_THUMB_BYTES = 5 * 1024 * 1024;

interface UploadValidationInput {
  type: AssetType;
  bytes: number;
}

export function validateUpload(input: UploadValidationInput, mimeType: string): void {
  if (
    !ASSET_TYPES.includes(input.type) ||
    !mimeType ||
    !Number.isSafeInteger(input.bytes) ||
    input.bytes <= 0
  ) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'valid type, mime_type and bytes are required',
    });
  }
  if (input.bytes > MAX_UPLOAD_BYTES) {
    throw new BadRequestException({
      code: 'ASSET_TOO_LARGE',
      message: `upload exceeds ${MAX_UPLOAD_BYTES} bytes`,
    });
  }
  const compatible =
    input.type === 'image'
      ? mimeType.startsWith('image/')
      : input.type === 'video'
        ? mimeType.startsWith('video/')
        : input.type === 'audio'
          ? mimeType.startsWith('audio/')
          : input.type === 'json'
            ? mimeType === 'application/json' || mimeType.endsWith('+json')
            : mimeType.startsWith('text/') ||
              mimeType === 'application/pdf' ||
              mimeType === 'application/octet-stream';
  if (!compatible) {
    throw new BadRequestException({
      code: 'MIME_TYPE_MISMATCH',
      message: `${mimeType} is not valid for ${input.type}`,
    });
  }
}

export function buildUploadKey(
  workspaceId: string,
  draftId: string,
  name: string | undefined,
  mime: string,
): string {
  return `xgcanvas/staging/uploads/${workspaceId}/${draftId}/source${guessExt(name, mime)}`;
}

export function buildFinalKey(draft: AssetUploadDraft, thumbnail: boolean): string {
  const project = draft.project_id ?? '_workspace';
  const extension = thumbnail
    ? '.jpg'
    : (draft.storage_key.match(/source(\.[a-z0-9]{1,12})$/i)?.[1] ?? '.bin');
  const suffix = thumbnail ? 'thumb' : 'source';
  return `xgcanvas/${draft.workspace_id}/${project}/uploads/${draft.id}/${suffix}${extension}`;
}

export function normaliseMime(value: string): string {
  return value.split(';')[0].trim().toLowerCase();
}

function guessExt(filename: string | undefined, mime: string): string {
  const fromName = filename?.match(/(\.[a-z0-9]{1,12})$/i)?.[1];
  if (fromName) return fromName.toLowerCase();
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'application/json': '.json',
    'text/plain': '.txt',
  };
  return map[mime] ?? '.bin';
}
