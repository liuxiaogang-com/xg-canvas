import {
  redactSecretLikeValues,
  redactSecretText,
  validateNonSecretConfig,
  validateOutboundBaseUrl,
} from '@xgcanvas/model-catalog';

import type { RecordRequestLog } from './request-log.types';

const PHYSICAL_ATTEMPT_FIELDS = [
  'logical_request_id',
  'workspace_id',
  'task_id',
  'model_id',
  'model_resource_uid',
  'model_revision_id',
  'catalog_epoch',
  'adapter_key',
  'channel_resource_uid',
  'channel_revision_id',
  'channel_route',
  'credential_id',
] as const satisfies readonly (keyof RecordRequestLog)[];

export function sanitizeRequestLogRecord(record: RecordRequestLog): RecordRequestLog {
  assertRecordShape(record);
  assertSafeChannelRoute(record.channel_route);
  return {
    ...record,
    channel_route: record.channel_route,
    request_summary: redactSecretLikeValues(record.request_summary),
    usage: redactSecretLikeValues(record.usage),
    vendor_error: redactSecretLikeValues(record.vendor_error),
    error_message: record.error_message == null ? null : redactSecretText(record.error_message),
    request_body: redactSecretLikeValues(record.request_body),
    response_body: redactSecretLikeValues(record.response_body),
  };
}

function assertRecordShape(record: RecordRequestLog): void {
  if (record.status === 'pending' && record.attempt_no == null) {
    throw new Error('pending request log must be a physical attempt');
  }
  if (record.attempt_no == null) return;
  if (!Number.isInteger(record.attempt_no) || record.attempt_no < 1) {
    throw new Error('request log attempt_no must be a positive integer');
  }
  const missing = PHYSICAL_ATTEMPT_FIELDS.find((field) => record[field] == null);
  if (missing) throw new Error(`physical request log is missing ${missing}`);
}

function assertSafeChannelRoute(route: RecordRequestLog['channel_route']): void {
  if (!route) return;
  if (route.base_url) {
    const issues = validateOutboundBaseUrl(route.base_url);
    if (issues.length > 0) {
      throw new Error(`unsafe request-log channel route: ${issues[0].message}`);
    }
  }
  const issues = validateNonSecretConfig(route.options, 'channel route options');
  if (issues.length > 0) {
    throw new Error(`unsafe request-log channel route: ${issues[0].path.join('.')}`);
  }
}
