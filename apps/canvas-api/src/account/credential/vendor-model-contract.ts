import { ConflictException } from '@nestjs/common';
import { MAX_MODEL_ID_LENGTH } from '@xgcanvas/shared-types';

export const OPENAI_TEXT_VENDOR_PROFILE = 'openai-text-chat-stream';

export function requireVendorContractAdapter(profile?: string): string {
  if (profile === OPENAI_TEXT_VENDOR_PROFILE) return 'openai-compat';
  throw new ConflictException({
    code: 'VENDOR_MODEL_CONTRACT_REQUIRED',
    message: 'vendor /models only returns ids; confirm an explicit contract profile before import',
  });
}

export function maxVendorModelIdLength(providerSlug: string): number {
  return MAX_MODEL_ID_LENGTH - providerSlug.length - 1;
}

export function assertVendorModelIdsFit(providerSlug: string, ids: readonly string[]): void {
  const maxLength = maxVendorModelIdLength(providerSlug);
  const invalid = ids.find((id) => id.length > maxLength);
  if (invalid) {
    throw new ConflictException({
      code: 'VENDOR_MODEL_ID_TOO_LONG',
      message: `vendor model id exceeds ${maxLength} characters for Provider ${providerSlug}`,
    });
  }
}
