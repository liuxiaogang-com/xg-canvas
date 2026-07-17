import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AccountInvokeClient } from '../account-client';
import type { Task } from '../database/entities';
import {
  RequestLogService,
  type AcceptedInvokeOrphan,
  type InvokeRecoveryAttempt,
} from '../request-log/request-log.service';
import type { ClaimedTask, ExternalTaskCorrelation } from './task-execution.store';
import { TaskService } from './task.service';

const DEFAULT_CHECK_MS = 15_000;
const DEFAULT_UNKNOWN_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_ABANDON_MS = 60 * 60_000;
const DEFAULT_DEFER_MS = 5_000;

export type ClaimedInvokeRecovery =
  | { kind: 'recovered' }
  | { kind: 'deferred' }
  | { kind: 'failed'; code: string; message: string };

/**
 * Repairs the durable boundary between an accepted async vendor job and Task.
 * A reclaimed logical invocation is never sent to the vendor a second time.
 */
@Injectable()
export class TaskInvokeRecoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskInvokeRecoveryService.name);
  private readonly checkMs: number;
  private readonly unknownTimeoutMs: number;
  private readonly abandonMs: number;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly tasks: TaskService,
    private readonly logs: RequestLogService,
    private readonly invoke: AccountInvokeClient,
    config: ConfigService,
  ) {
    this.checkMs = positiveInteger(config, 'TASK_INVOKE_RECOVERY_CHECK_MS', DEFAULT_CHECK_MS);
    this.unknownTimeoutMs = positiveInteger(
      config,
      'TASK_INVOKE_RECOVERY_TIMEOUT_MS',
      DEFAULT_UNKNOWN_TIMEOUT_MS,
    );
    this.abandonMs = positiveInteger(config, 'TASK_INVOKE_ABANDON_MS', DEFAULT_ABANDON_MS);
    if (this.abandonMs <= this.unknownTimeoutMs) {
      throw new Error(
        'TASK_INVOKE_ABANDON_MS must be greater than TASK_INVOKE_RECOVERY_TIMEOUT_MS',
      );
    }
  }

  onModuleInit(): void {
    this.timer = setInterval(() => this.runGuarded(), this.checkMs);
    this.timer.unref?.();
    void this.runGuarded();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async recoverClaimed(task: ClaimedTask): Promise<ClaimedInvokeRecovery> {
    const logicalId = task.invoke_logical_request_id;
    if (!logicalId) {
      return {
        kind: 'failed',
        code: 'INVOKE_CORRELATION_MISSING',
        message: 'Task invoke correlation is missing',
      };
    }
    const attempts = await this.logs.listInvokeRecoveryAttempts(task.id, logicalId);
    const accepted = attempts.find((row) => row.status === 'pending' && row.external_task_id);
    if (accepted) {
      const attached = await this.tasks.saveExternalResult(
        task.id,
        task.lease_token,
        correlation(accepted),
      );
      if (attached) return { kind: 'recovered' };
      const current = await this.tasks.findInternal(task.id);
      if (sameCorrelation(current, accepted)) return { kind: 'recovered' };
      await this.compensate(accepted);
      return { kind: 'deferred' };
    }

    const terminal = attempts[0];
    if (terminal && terminal.status !== 'pending') {
      if (terminal.status === 'success') {
        return {
          kind: 'failed',
          code: 'INVOKE_RESULT_LOST',
          message:
            'Vendor request succeeded but its synchronous result was not committed to the Task',
        };
      }
      return {
        kind: 'failed',
        code: terminal.error_code ?? 'VENDOR_REJECTED',
        message: terminal.error_message ?? 'Vendor request ended before Task state was committed',
      };
    }

    const preflight = await this.logs.findInvokePreflightFailure(task.id, logicalId);
    if (preflight) {
      return {
        kind: 'failed',
        code: preflight.error_code ?? 'VENDOR_REJECTED',
        message:
          preflight.error_message ?? 'Invoke preflight failed before Task state was committed',
      };
    }

    if (recoveryExpired(task.invoke_prepared_at, this.unknownTimeoutMs)) {
      return {
        kind: 'failed',
        code: 'INVOKE_OUTCOME_UNKNOWN',
        message: 'Vendor dispatch outcome remained unknown after the recovery timeout',
      };
    }
    await this.tasks.deferInvokeRecovery(
      task.id,
      task.lease_token,
      new Date(Date.now() + DEFAULT_DEFER_MS),
    );
    return { kind: 'deferred' };
  }

  async reconcileAcceptedOrphans(limit = 100): Promise<number> {
    const rows = await this.logs.listAcceptedInvokeOrphans(limit);
    let repaired = 0;
    for (const row of rows) {
      if (sameRawCorrelation(row)) {
        if (await this.finalizeAttachedTerminal(row)) repaired += 1;
        continue;
      }
      if (sameVendorJob(row)) {
        if (
          await this.logs.finalizePending(row.id, {
            status: 'cancelled',
            error_code: 'DUPLICATE_INVOKE_CORRELATION',
            error_message: 'Duplicate ledger row resolved to the already-attached vendor job',
          })
        )
          repaired += 1;
        continue;
      }
      if (hasActiveOwner(row)) continue;
      if (canAttach(row)) {
        const attached = await this.tasks.attachRecoveredWithoutLease(
          row.task_id,
          row.logical_request_id,
          correlation(row),
        );
        if (attached) {
          repaired += 1;
          continue;
        }
        const current = await this.tasks.findInternal(row.task_id);
        if (sameCorrelation(current, row)) continue;
      }
      if (await this.compensate(row)) repaired += 1;
    }
    return repaired;
  }

  private async finalizeAttachedTerminal(row: AcceptedInvokeOrphan): Promise<boolean> {
    if (row.task_status === 'succeeded') {
      return this.logs.finalizePending(row.id, { status: 'success' });
    }
    if (row.task_status === 'cancelled') {
      return this.logs.finalizePending(row.id, { status: 'cancelled' });
    }
    if (row.task_status === 'failed') {
      return this.logs.finalizePending(row.id, {
        status: 'error',
        error_code: row.task_error?.code ?? 'TASK_FAILED',
        error_message: row.task_error?.message ?? 'Task failed before invoke log finalization',
      });
    }
    return false;
  }

  async reconcileAbandonedUnknowns(limit = 100): Promise<number> {
    const rows = await this.logs.listAbandonedUnknownInvokes(
      new Date(Date.now() - this.abandonMs),
      limit,
    );
    let finalized = 0;
    for (const row of rows) {
      if (
        await this.logs.finalizePendingWithoutExternal(row.id, {
          status: 'timeout',
          error_code: 'INVOKE_OUTCOME_ABANDONED',
          error_message: 'Unknown vendor outcome was abandoned after the safety window',
        })
      )
        finalized += 1;
    }
    return finalized;
  }

  private async compensate(attempt: InvokeRecoveryAttempt): Promise<boolean> {
    if (!attempt.external_task_id) return false;
    try {
      await this.invoke.cancel({
        model_resource_uid: attempt.model_resource_uid,
        model_revision_id: attempt.model_revision_id,
        rate_card_revision_id: attempt.rate_card_revision_id,
        catalog_epoch: attempt.catalog_epoch,
        task_id: attempt.task_id,
        external_task_id: attempt.external_task_id,
        model_id: attempt.model_id,
        workspace_id: attempt.workspace_id,
        owner_id: attempt.owner_id ?? undefined,
        project_id: attempt.project_id ?? undefined,
        channel_resource_uid: attempt.channel_resource_uid,
        channel_revision_id: attempt.channel_revision_id,
        channel_route: attempt.channel_route,
        credential_id: attempt.credential_id,
      });
      return this.logs.finalizePending(attempt.id, { status: 'cancelled' });
    } catch (error) {
      this.logger.warn(
        `failed to compensate orphan invoke ${attempt.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  private async runGuarded(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const repaired = await this.reconcileAcceptedOrphans();
      const abandoned = await this.reconcileAbandonedUnknowns();
      if (repaired > 0 || abandoned > 0) {
        this.logger.warn(
          `reconciled ${repaired} accepted orphan invoke(s), abandoned ${abandoned} unknown attempt(s)`,
        );
      }
    } catch (error) {
      this.logger.error(`invoke recovery failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}

function correlation(attempt: InvokeRecoveryAttempt): ExternalTaskCorrelation {
  return {
    external_task_id: attempt.external_task_id!,
    invoke_request_id: attempt.id,
    invoke_logical_request_id: attempt.logical_request_id,
    channel_resource_uid: attempt.channel_resource_uid,
    channel_revision_id: attempt.channel_revision_id,
    channel_route: attempt.channel_route,
    credential_id: attempt.credential_id,
    next_poll_at: new Date(),
  };
}

function sameCorrelation(task: Task | null, attempt: InvokeRecoveryAttempt): boolean {
  return Boolean(
    task &&
    task.external_task_id === attempt.external_task_id &&
    task.channel_resource_uid === attempt.channel_resource_uid &&
    task.channel_revision_id === attempt.channel_revision_id &&
    task.credential_id === attempt.credential_id,
  );
}

function sameRawCorrelation(row: AcceptedInvokeOrphan): boolean {
  return (
    row.task_invoke_request_id === row.id && row.task_external_task_id === row.external_task_id
  );
}

function sameVendorJob(row: AcceptedInvokeOrphan): boolean {
  return Boolean(
    row.task_external_task_id === row.external_task_id &&
    row.task_channel_resource_uid === row.channel_resource_uid &&
    row.task_channel_revision_id === row.channel_revision_id &&
    row.task_credential_id === row.credential_id,
  );
}

function canAttach(row: AcceptedInvokeOrphan): boolean {
  if (row.task_invoke_logical_request_id !== row.logical_request_id) return false;
  if (row.task_external_task_id || !['queued', 'running'].includes(row.task_status ?? ''))
    return false;
  return !row.task_lease_expires_at || new Date(row.task_lease_expires_at).getTime() <= Date.now();
}

function hasActiveOwner(row: AcceptedInvokeOrphan): boolean {
  return Boolean(
    row.task_invoke_logical_request_id === row.logical_request_id &&
    !row.task_external_task_id &&
    ['queued', 'running'].includes(row.task_status ?? '') &&
    row.task_lease_expires_at &&
    new Date(row.task_lease_expires_at).getTime() > Date.now(),
  );
}

function recoveryExpired(preparedAt: Date | null, timeoutMs: number): boolean {
  return !preparedAt || Date.now() - new Date(preparedAt).getTime() >= timeoutMs;
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
