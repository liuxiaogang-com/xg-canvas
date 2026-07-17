import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import { redactSecretLikeValues, redactSecretText } from '@xgcanvas/model-catalog';

import { CostService } from '../billing/cost.service';
import { RequestLog } from './request-log.entity';
import { sanitizeRequestLogRecord } from './request-log-record';
import type {
  AcceptedInvokeOrphan,
  FinalizePendingRequestLog,
  InvokePreflightFailure,
  InvokeRecoveryAttempt,
  PurgeOptions,
  RecordRequestLog,
  RequestLogQuery,
  UpdatePendingRequestLog,
} from './request-log.types';
import {
  externalTaskId,
  INVOKE_RECOVERY_COLUMNS,
  isCompleteAcceptedOrphan,
  isCompleteRecoveryAttempt,
  mergeUsage,
  normalizeRecoveryAttempt,
} from './request-log.utils';

export type {
  AcceptedInvokeOrphan,
  FinalizePendingRequestLog,
  InvokePreflightFailure,
  InvokeRecoveryAttempt,
  PurgeOptions,
  RecordRequestLog,
  RequestLogQuery,
  RequestLogStatus,
  UpdatePendingRequestLog,
} from './request-log.types';

@Injectable()
export class RequestLogService {
  private readonly logger = new Logger(RequestLogService.name);

  constructor(
    @InjectRepository(RequestLog)
    private readonly repo: Repository<RequestLog>,
    private readonly cost: CostService,
  ) {}

  /** Persist one completed request. Best-effort: callers should not let a log
   *  write failure break the actual request (wrap in catch at the call site).
   *  Freezes cost from native usage meters × the pinned immutable Rate Card. */
  async record(e: RecordRequestLog): Promise<void> {
    const safe = sanitizeRequestLogRecord(e);
    let cost: number | null = null;
    let cost_currency: string | null = null;
    if (safe.status === 'success') {
      const c = await this.cost
        .computeCost(safe.rate_card_revision_id, safe.usage)
        .catch((error) => {
          this.logger.error(
            `billing calculation failed for request ${safe.id}: ${redactSecretText((error as Error).message)}`,
          );
          return null;
        });
      if (c) {
        cost = c.cost;
        cost_currency = c.currency;
      }
    }
    // `as never`: TypeORM's QueryDeepPartialEntity mistypes jsonb object columns.
    await this.repo.insert({
      ...safe,
      cost,
      cost_currency,
      finished_at: safe.status === 'pending' ? null : new Date(),
    } as never);
  }

  /**
   * Completes an async invoke log exactly once. The pending row is written
   * before InvokeService returns the vendor task id, so a polling terminal
   * transition can always reconcile actual usage against the pinned Rate Card.
   */
  async finalizePending(
    id: string,
    patch: FinalizePendingRequestLog,
    manager?: EntityManager,
  ): Promise<boolean> {
    const repo = manager?.getRepository(RequestLog) ?? this.repo;
    const current = await repo.findOne({ where: { id } });
    if (!current || current.status !== 'pending') return false;

    const usage = mergeUsage(current.usage, patch.usage);
    let cost: number | null = null;
    let costCurrency: string | null = null;
    if (patch.status === 'success') {
      const computed = await this.cost
        .computeCost(current.rate_card_revision_id, usage)
        .catch((error) => {
          this.logger.error(
            `billing calculation failed for request ${id}: ${redactSecretText((error as Error).message)}`,
          );
          return null;
        });
      cost = computed?.cost ?? null;
      costCurrency = computed?.currency ?? null;
    }

    const result = await repo
      .createQueryBuilder()
      .update(RequestLog)
      .set({
        status: patch.status,
        usage,
        http_status: patch.http_status ?? current.http_status,
        latency_ms: patch.latency_ms ?? current.latency_ms,
        cost: cost == null ? null : String(cost),
        cost_currency: costCurrency,
        error_code: patch.error_code ?? null,
        error_message: redactOptionalText(patch.error_message),
        vendor_error: redactSecretLikeValues(patch.vendor_error ?? current.vendor_error),
        response_body: redactSecretLikeValues(patch.response_body ?? current.response_body),
        finished_at: new Date(),
      } as never)
      .where('id = :id AND status = :pending', { id, pending: 'pending' })
      .execute();
    return result.affected === 1;
  }

  /** Adds submit-time usage/latency while an asynchronous vendor job remains pending. */
  async updatePending(id: string, patch: UpdatePendingRequestLog): Promise<boolean> {
    const current = await this.repo.findOne({ where: { id } });
    if (!current || current.status !== 'pending') return false;
    const result = await this.repo
      .createQueryBuilder()
      .update(RequestLog)
      .set({
        usage: mergeUsage(current.usage, patch.usage),
        http_status: patch.http_status ?? current.http_status,
        latency_ms: patch.latency_ms ?? current.latency_ms,
        error_code: patch.error_code ?? current.error_code,
        error_message: redactOptionalText(patch.error_message ?? current.error_message),
        vendor_error: redactSecretLikeValues(patch.vendor_error ?? current.vendor_error),
        response_body: redactSecretLikeValues(patch.response_body ?? current.response_body),
      } as never)
      .where('id = :id AND status = :pending', { id, pending: 'pending' })
      .execute();
    return result.affected === 1;
  }

  /** Terminalize an unknown attempt only if no accepted vendor task appeared meanwhile. */
  async finalizePendingWithoutExternal(
    id: string,
    patch: Omit<FinalizePendingRequestLog, 'status'> & {
      status: 'timeout' | 'cancelled' | 'error';
    },
  ): Promise<boolean> {
    const current = await this.repo.findOne({ where: { id } });
    if (!current || current.status !== 'pending' || externalTaskId(current.response_body))
      return false;
    const result = await this.repo
      .createQueryBuilder()
      .update(RequestLog)
      .set({
        status: patch.status,
        http_status: patch.http_status ?? current.http_status,
        latency_ms: patch.latency_ms ?? current.latency_ms,
        error_code: patch.error_code ?? null,
        error_message: redactOptionalText(patch.error_message),
        vendor_error: redactSecretLikeValues(patch.vendor_error ?? current.vendor_error),
        finished_at: new Date(),
      } as never)
      .where(
        "id = :id AND status = 'pending' AND NULLIF(response_body->>'external_task_id', '') IS NULL",
        { id },
      )
      .execute();
    return result.affected === 1;
  }

  /** Allocates the next ledger attempt number for a stable logical invocation. */
  async nextAttemptNo(logicalRequestId: string): Promise<number> {
    const rows = (await this.repo.query(
      `SELECT (COALESCE(MAX(attempt_no), 0) + 1)::int AS next_attempt_no
         FROM ops.request_logs
        WHERE source = 'invoke' AND logical_request_id = $1`,
      [logicalRequestId],
    )) as Array<{ next_attempt_no: number | string }>;
    return Number(rows[0]?.next_attempt_no ?? 1);
  }

  async listInvokeRecoveryAttempts(
    taskId: string,
    logicalRequestId: string,
  ): Promise<InvokeRecoveryAttempt[]> {
    const rows = (await this.repo.query(
      `SELECT ${INVOKE_RECOVERY_COLUMNS}
         FROM ops.request_logs r
        WHERE r.source = 'invoke'
          AND r.task_id = $1
          AND r.logical_request_id = $2
          AND r.attempt_no IS NOT NULL
        ORDER BY r.attempt_no DESC, r.created_at DESC`,
      [taskId, logicalRequestId],
    )) as InvokeRecoveryAttempt[];
    return rows.map(normalizeRecoveryAttempt).filter(isCompleteRecoveryAttempt);
  }

  async hasUnresolvedInvoke(logicalRequestId: string): Promise<boolean> {
    const rows = (await this.repo.query(
      `SELECT EXISTS (
         SELECT 1 FROM ops.request_logs
          WHERE source = 'invoke' AND logical_request_id = $1 AND status = 'pending'
       ) AS present`,
      [logicalRequestId],
    )) as Array<{ present: boolean }>;
    return rows[0]?.present === true;
  }

  async findInvokePreflightFailure(
    taskId: string,
    logicalRequestId: string,
  ): Promise<InvokePreflightFailure | null> {
    const rows = (await this.repo.query(
      `SELECT id, status, error_code, error_message
         FROM ops.request_logs
        WHERE source = 'invoke' AND task_id = $1 AND logical_request_id = $2
          AND attempt_no IS NULL AND status IN ('error', 'timeout', 'cancelled')
        ORDER BY created_at DESC LIMIT 1`,
      [taskId, logicalRequestId],
    )) as InvokePreflightFailure[];
    return rows[0] ?? null;
  }

  async listAcceptedInvokeOrphans(limit = 100): Promise<AcceptedInvokeOrphan[]> {
    const rows = (await this.repo.query(
      `SELECT ${INVOKE_RECOVERY_COLUMNS},
              t.status AS task_status,
              t.error AS task_error,
              t.invoke_logical_request_id AS task_invoke_logical_request_id,
              t.invoke_request_id AS task_invoke_request_id,
              t.external_task_id AS task_external_task_id,
              t.lease_expires_at AS task_lease_expires_at,
              t.channel_resource_uid AS task_channel_resource_uid,
              t.channel_revision_id AS task_channel_revision_id,
              t.credential_id AS task_credential_id
         FROM ops.request_logs r
         LEFT JOIN canvas.tasks t ON t.id::text = r.task_id
        WHERE r.source = 'invoke'
          AND r.status = 'pending'
          AND r.attempt_no IS NOT NULL
          AND NULLIF(r.response_body->>'external_task_id', '') IS NOT NULL
        ORDER BY r.logical_request_id, r.attempt_no DESC, r.created_at DESC
        LIMIT $1`,
      [Math.max(1, Math.min(limit, 1000))],
    )) as AcceptedInvokeOrphan[];
    return rows
      .map((row) => ({ ...row, ...normalizeRecoveryAttempt(row) }))
      .filter(isCompleteAcceptedOrphan);
  }

  async listAbandonedUnknownInvokes(
    createdBefore: Date,
    limit = 100,
  ): Promise<InvokeRecoveryAttempt[]> {
    const rows = (await this.repo.query(
      `SELECT ${INVOKE_RECOVERY_COLUMNS}
         FROM ops.request_logs r
         JOIN canvas.tasks t ON t.id::text = r.task_id
        WHERE r.source = 'invoke' AND r.status = 'pending'
          AND r.attempt_no IS NOT NULL
          AND NULLIF(r.response_body->>'external_task_id', '') IS NULL
          AND r.created_at < $1
          AND t.status IN ('failed', 'cancelled')
          AND t.invoke_logical_request_id = r.logical_request_id
          AND (t.status = 'cancelled' OR t.error->>'code' = 'INVOKE_OUTCOME_UNKNOWN')
        ORDER BY r.created_at ASC
        LIMIT $2`,
      [createdBefore, Math.max(1, Math.min(limit, 1000))],
    )) as InvokeRecoveryAttempt[];
    return rows.map(normalizeRecoveryAttempt).filter(isCompleteRecoveryAttempt);
  }

  async list(q: RequestLogQuery): Promise<RequestLog[]> {
    const qb = this.repo.createQueryBuilder('r').orderBy('r.created_at', 'DESC');
    if (q.status) qb.andWhere('r.status = :status', { status: q.status });
    if (q.source) qb.andWhere('r.source = :source', { source: q.source });
    if (q.provider_slug) qb.andWhere('r.provider_slug = :p', { p: q.provider_slug });
    if (q.model_id) qb.andWhere('r.model_id = :m', { m: q.model_id });
    if (q.owner_id) qb.andWhere('r.owner_id = :o', { o: q.owner_id });
    if (q.before) qb.andWhere('r.created_at < :before', { before: q.before });
    qb.limit(Math.min(q.limit ?? 50, 200));
    return qb.getMany();
  }

  get(id: string): Promise<RequestLog | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** Retention cleanup. Refuses to run without at least one filter (no mass wipe). */
  async purge(opts: PurgeOptions): Promise<number> {
    if (opts.status === 'pending') return 0;
    const where: string[] = ["status <> 'pending'"];
    const params: Record<string, unknown> = {};
    if (opts.before) {
      where.push('created_at < :before');
      params.before = opts.before;
    }
    if (opts.status) {
      where.push('status = :status');
      params.status = opts.status;
    }
    if (opts.provider_slug) {
      where.push('provider_slug = :p');
      params.p = opts.provider_slug;
    }
    if (where.length === 1) return 0;
    const res = await this.repo
      .createQueryBuilder()
      .delete()
      .where(where.join(' AND '), params)
      .execute();
    return res.affected ?? 0;
  }
}

function redactOptionalText(value: string | null | undefined): string | null {
  return value == null ? null : redactSecretText(value);
}
