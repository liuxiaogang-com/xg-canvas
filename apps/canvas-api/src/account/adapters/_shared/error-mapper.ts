import { AdapterError, wrapUnknownVendorError } from '@xgcanvas/adapters-contract';
import { ERROR_CODES, type ErrorCode } from '@xgcanvas/shared-types';

/**
 * Adapter authors call this from a catch-all to give InvokeService a
 * stable AdapterError. Pass an extractor for vendor-specific code → ErrorCode.
 */
export function mapVendorError(
  e: unknown,
  resolve?: (vendor: unknown) => ErrorCode | null,
): AdapterError {
  if (e instanceof AdapterError) {
    if (resolve) {
      const better = resolve(e.vendor);
      if (better && better !== e.code) {
        return new AdapterError({
          code: better,
          message: e.message,
          retryable: e.retryable,
          vendor: e.vendor,
          httpStatus: e.httpStatus,
          dispatch_outcome: e.dispatch_outcome,
          accepted_result: e.accepted_result,
        });
      }
    }
    return e;
  }
  return wrapUnknownVendorError(e);
}

export const COMMON_VENDOR_CODES: Record<string, ErrorCode> = {
  rate_limit_exceeded: ERROR_CODES.RATE_LIMITED,
  insufficient_quota: ERROR_CODES.QUOTA_EXCEEDED,
  content_policy_violation: ERROR_CODES.VENDOR_CONTENT_FILTERED,
  invalid_api_key: ERROR_CODES.CREDENTIAL_INVALID,
};
