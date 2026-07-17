import {
  redactSecretLikeValues,
  redactSecretText,
  sanitizeChannelRouteSnapshot,
} from '@xgcanvas/model-catalog';
import type { RequestLog } from './request-log.entity';

/** API-only projection; recovery services continue to read the stored exact safe route. */
export function presentRequestLog(log: RequestLog): RequestLog {
  return {
    ...log,
    channel_route: sanitizeChannelRouteSnapshot(log.channel_route),
    request_summary: redactSecretLikeValues(log.request_summary),
    usage: redactSecretLikeValues(log.usage),
    vendor_error: redactSecretLikeValues(log.vendor_error),
    request_body: redactSecretLikeValues(log.request_body),
    response_body: redactSecretLikeValues(log.response_body),
    error_message: log.error_message == null ? null : redactSecretText(log.error_message),
  };
}
