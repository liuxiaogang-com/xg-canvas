import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { RequestLogService } from './request-log.service';

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_TASK_GRACE_MS = 5 * 60_000;
const DEFAULT_DETACHED_GRACE_MS = 60 * 60_000;

interface PendingCandidate {
  id: string;
  source: string;
  attempt_no: number | null;
  task_status: string | null;
  task_error: { code?: string; message?: string } | null;
  referenced_by_task: boolean;
}

/** Closes pending rows left by a process crash between vendor I/O and Task correlation. */
@Injectable()
export class RequestLogReconcilerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RequestLogReconcilerService.name);
  private readonly enabled: boolean;
  private readonly intervalMs: number;
  private readonly taskGraceMs: number;
  private readonly detachedGraceMs: number;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly logs: RequestLogService,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('REQUEST_LOG_RECONCILER_ENABLED', 'true') === 'true';
    this.intervalMs = positiveInteger(config, 'REQUEST_LOG_RECONCILE_MS', DEFAULT_INTERVAL_MS);
    this.taskGraceMs = positiveInteger(config, 'REQUEST_LOG_TASK_GRACE_MS', DEFAULT_TASK_GRACE_MS);
    this.detachedGraceMs = positiveInteger(
      config,
      'REQUEST_LOG_DETACHED_GRACE_MS',
      DEFAULT_DETACHED_GRACE_MS,
    );
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    this.timer = setInterval(() => this.runGuarded(), this.intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async reconcileOnce(limit = 100): Promise<number> {
    const rows = await this.dataSource.query<PendingCandidate[]>(
      `SELECT r.id, r.source, r.attempt_no,
              t.status AS task_status,
              t.error AS task_error,
              COALESCE(t.invoke_request_id = r.id, false) AS referenced_by_task
         FROM ops.request_logs r
        LEFT JOIN canvas.tasks t ON t.id::text = r.task_id
        WHERE r.status = 'pending'
          AND NOT (
            r.source = 'invoke' AND r.attempt_no IS NOT NULL
            AND NULLIF(r.response_body->>'external_task_id', '') IS NOT NULL
          )
          AND NOT (
            r.source = 'invoke' AND t.invoke_logical_request_id = r.logical_request_id
          )
          AND (
            (t.id IS NULL AND r.created_at < NOW() - ($2::bigint * INTERVAL '1 millisecond'))
            OR (
              t.id IS NOT NULL
              AND r.created_at < NOW() - ($1::bigint * INTERVAL '1 millisecond')
              AND (
                (t.invoke_request_id = r.id AND t.status IN ('succeeded', 'failed', 'cancelled'))
                OR (
                  t.invoke_request_id IS DISTINCT FROM r.id
                  AND (t.lease_expires_at IS NULL OR t.lease_expires_at < NOW())
                )
              )
            )
          )
        ORDER BY r.created_at ASC
        LIMIT $3`,
      [this.taskGraceMs, this.detachedGraceMs, Math.max(1, Math.min(limit, 1000))],
    );
    let finalized = 0;
    for (const row of rows) {
      const patch = terminalPatch(row);
      const updated =
        row.source === 'invoke' && row.attempt_no !== null && patch.status !== 'success'
          ? await this.logs.finalizePendingWithoutExternal(row.id, patch)
          : await this.logs.finalizePending(row.id, patch);
      if (updated) finalized += 1;
    }
    return finalized;
  }

  private async runGuarded(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const count = await this.reconcileOnce();
      if (count > 0) this.logger.warn(`reconciled ${count} stale pending request log(s)`);
    } catch (error) {
      this.logger.error(`request-log reconciliation failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}

function terminalPatch(row: PendingCandidate) {
  if (row.referenced_by_task && row.task_status === 'succeeded') {
    return { status: 'success' as const };
  }
  if (row.task_status === 'cancelled') return { status: 'cancelled' as const };
  if (row.task_status === 'failed') {
    return {
      status: 'error' as const,
      error_code: row.task_error?.code ?? 'TASK_FAILED',
      error_message: row.task_error?.message ?? 'Task failed before request-log finalization',
    };
  }
  return {
    status: 'timeout' as const,
    error_code: 'REQUEST_LOG_ORPHANED',
    error_message: 'Process ended before the vendor attempt could be correlated to a Task',
  };
}

function positiveInteger(config: ConfigService, key: string, fallback: number): number {
  const raw = config.get<string>(key);
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > 24 * 60 * 60 * 1000) {
    throw new Error(`${key} must be an integer between 1 and 86400000`);
  }
  return value;
}
