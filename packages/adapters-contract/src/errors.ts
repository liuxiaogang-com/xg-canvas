/**
 * AdapterError — thrown by adapters; mapped to ApiError before crossing
 * the service boundary. Adapters MUST use this rather than a bare Error
 * so InvokeService can attach retry policy without sniffing strings.
 */

import { ERROR_CODES, type ApiError, type ErrorCode } from '@xgcanvas/shared-types';
import type { UsageStats } from './unified-response';

export type DispatchOutcome = 'definitely_rejected' | 'outcome_unknown' | 'accepted';

/** Terminal vendor evidence captured before local result ingestion failed. */
export interface AcceptedVendorResult {
  usage?: UsageStats;
  vendor_request_id?: string;
}

export class AdapterError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly vendor?: unknown;
  readonly httpStatus?: number;
  readonly dispatch_outcome: DispatchOutcome;
  readonly accepted_result?: AcceptedVendorResult;

  constructor(opts: {
    code: ErrorCode;
    message: string;
    retryable?: boolean;
    vendor?: unknown;
    httpStatus?: number;
    dispatch_outcome?: DispatchOutcome;
    accepted_result?: AcceptedVendorResult;
  }) {
    super(opts.message);
    this.name = 'AdapterError';
    this.code = opts.code;
    this.retryable = opts.retryable ?? false;
    this.vendor = opts.vendor;
    this.httpStatus = opts.httpStatus;
    this.dispatch_outcome = opts.dispatch_outcome ?? 'definitely_rejected';
    this.accepted_result = opts.accepted_result;
    if (this.accepted_result && this.dispatch_outcome !== 'accepted') {
      throw new TypeError('accepted_result requires dispatch_outcome=accepted');
    }
  }

  toApiError(): ApiError {
    return {
      code: this.code,
      message: this.message,
      http_status: this.httpStatus,
      details: this.vendor,
    };
  }
}

export function isAdapterError(e: unknown): e is AdapterError {
  return e instanceof AdapterError;
}

/** Helper for the common "unknown vendor failure" case. */
export function wrapUnknownVendorError(e: unknown): AdapterError {
  if (isAdapterError(e)) return e;
  const message = e instanceof Error ? e.message : String(e);
  return new AdapterError({
    code: ERROR_CODES.ADAPTER_INTERNAL,
    message,
    retryable: false,
    dispatch_outcome: 'outcome_unknown',
    vendor: e,
  });
}
