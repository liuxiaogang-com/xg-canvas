import type { AcceptedInvokeOrphan, InvokeRecoveryAttempt } from './request-log.types';

export function mergeUsage(
  initial: Record<string, unknown> | null,
  terminal: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const merged = { ...(initial ?? {}), ...(terminal ?? {}) };
  return Object.keys(merged).length > 0 ? merged : null;
}

export function externalTaskId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = (value as Record<string, unknown>).external_task_id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export const INVOKE_RECOVERY_COLUMNS = `
  r.id, r.logical_request_id, r.attempt_no, r.status, r.task_id,
  r.owner_id, r.workspace_id, r.project_id, r.model_id,
  r.model_resource_uid, r.model_revision_id, r.rate_card_revision_id,
  r.catalog_epoch::text AS catalog_epoch, r.channel_resource_uid,
  r.channel_revision_id, r.channel_route, r.credential_id,
  NULLIF(r.response_body->>'external_task_id', '') AS external_task_id,
  r.error_code, r.error_message, r.created_at`;

export function normalizeRecoveryAttempt<T extends InvokeRecoveryAttempt>(row: T): T {
  return {
    ...row,
    attempt_no: Number(row.attempt_no),
    catalog_epoch: row.catalog_epoch == null ? row.catalog_epoch : String(row.catalog_epoch),
    created_at: new Date(row.created_at),
  };
}

export function isCompleteRecoveryAttempt(row: InvokeRecoveryAttempt): boolean {
  return Boolean(
    row.id &&
    row.logical_request_id &&
    row.task_id &&
    row.workspace_id &&
    row.model_id &&
    row.model_resource_uid &&
    row.model_revision_id &&
    row.catalog_epoch &&
    row.channel_resource_uid &&
    row.channel_revision_id &&
    row.channel_route &&
    row.credential_id,
  );
}

export function isCompleteAcceptedOrphan(row: AcceptedInvokeOrphan): boolean {
  return isCompleteRecoveryAttempt(row) && Boolean(row.external_task_id);
}
