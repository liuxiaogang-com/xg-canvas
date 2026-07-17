import { randomUUID } from 'node:crypto';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { redactSecretText } from '@xgcanvas/model-catalog';
import type { ChannelRouteSnapshot, TaskType } from '@xgcanvas/shared-types';

import { AccountInvokeClient } from '../account-client';
import { decideRetry } from './retry-policy';
import { type ClaimedTask, TaskService } from './task.service';
import { TaskTerminalService } from './task-terminal.service';
import { requireTaskModelPin } from './task-model-pin';
import { TaskInvokeRecoveryService } from './task-invoke-recovery.service';
import { TaskInputResolverService } from './task-input-resolver.service';

@Injectable()
export class TaskExecutorService {
  private readonly logger = new Logger(TaskExecutorService.name);

  constructor(
    private readonly tasks: TaskService,
    private readonly invoke: AccountInvokeClient,
    private readonly inputs: TaskInputResolverService,
    private readonly terminal: TaskTerminalService,
    private readonly recovery: TaskInvokeRecoveryService,
  ) {}

  /** Dispatch a leased task. Every persisted change is guarded by its token. */
  async run(claimed: ClaimedTask, signal?: AbortSignal): Promise<void> {
    const started = await this.tasks.startClaimed(claimed);
    if (!started) return;
    const reclaimed = Boolean(started.invoke_logical_request_id);
    const t = await this.tasks.prepareInvokeAttempt(
      started.id,
      started.lease_token,
      started.invoke_logical_request_id ?? randomUUID(),
    );
    if (!t?.invoke_logical_request_id) return;
    if (reclaimed) {
      const recovery = await this.recovery.recoverClaimed(t);
      if (recovery.kind === 'failed') {
        await this.handleFailed(t, recovery.code, recovery.message);
      }
      return;
    }

    try {
      const res = await this.invoke.invoke(
        {
          resolution: { kind: 'pinned', pin: requireTaskModelPin(t) },
          task_id: t.id,
          task_type: t.type as TaskType,
          model_id: t.model_id,
          workspace_id: t.workspace_id,
          owner_id: t.owner_id,
          project_id: t.project_id ?? undefined,
          params: t.params,
          inputs: await this.inputs.resolve(t),
          idempotency_key: `task:${t.id}:attempt:${t.attempt_no}`,
          logical_request_id: t.invoke_logical_request_id,
        },
        signal,
      );
      if (res.status === 'running') {
        await this.handleRunning(
          t,
          res.request_id,
          res.external_task_id,
          res.channel_resource_uid,
          res.channel_revision_id,
          res.channel_route,
          res.credential_id,
          res.next_poll_after_ms,
        );
        return;
      }
      if (res.status === 'succeeded') {
        await this.terminal.succeed(t.id, t.lease_token, {
          assets: res.assets,
          text: res.text,
          json: res.json,
          channel_resource_uid: res.channel_resource_uid,
          channel_revision_id: res.channel_revision_id,
          channel_route: res.channel_route,
          credential_id: res.credential_id,
        });
        return;
      }
      await this.handleFailed(
        t,
        res.error?.code ?? 'VENDOR_REJECTED',
        res.error?.message ?? 'vendor failed',
      );
    } catch (e) {
      const { code, message: baseMsg, requestId, allowRedispatch } = taskError(e);
      const msg = requestId ? `${baseMsg}（请求 ID: ${requestId}）` : baseMsg;
      this.logger.warn(`task ${t.id} invoke failed: ${code} ${msg}`);
      await this.handleFailed(t, code, msg, allowRedispatch);
    }
  }

  private async handleRunning(
    t: ClaimedTask,
    requestId: string | undefined,
    externalId: string | undefined,
    channelResourceUid?: string,
    channelRevisionId?: string,
    channelRoute?: ChannelRouteSnapshot,
    credentialId?: string,
    after?: number,
  ): Promise<void> {
    if (
      !requestId ||
      !externalId ||
      !channelResourceUid ||
      !channelRevisionId ||
      !channelRoute ||
      !credentialId
    ) {
      if (requestId) {
        await this.terminal.finalizeInvokeRequest(requestId, {
          status: 'error',
          error_code: 'VENDOR_REJECTED',
          error_message: 'async adapter returned incomplete routing metadata',
        });
      }
      await this.cancelVendorJob(
        t,
        externalId,
        channelResourceUid,
        channelRevisionId,
        channelRoute,
        credentialId,
      );
      await this.handleFailed(
        t,
        'VENDOR_REJECTED',
        'async adapter must return complete request, route and credential metadata',
      );
      return;
    }
    let saved: boolean;
    try {
      saved = await this.tasks.saveExternalResult(t.id, t.lease_token, {
        external_task_id: externalId,
        invoke_request_id: requestId,
        invoke_logical_request_id: t.invoke_logical_request_id!,
        channel_resource_uid: channelResourceUid,
        channel_revision_id: channelRevisionId,
        channel_route: channelRoute,
        credential_id: credentialId,
        next_poll_at: new Date(Date.now() + (after ?? 2000)),
      });
    } catch (error) {
      await this.cancelVendorJob(
        t,
        externalId,
        channelResourceUid,
        channelRevisionId,
        channelRoute,
        credentialId,
      );
      await this.terminal.finalizeInvokeRequest(requestId, {
        status: 'error',
        error_code: 'INTERNAL_ERROR',
        error_message: 'failed to persist async vendor task routing',
      });
      throw error;
    }
    if (!saved) {
      // Cancellation may have won while invoke was in flight. Stop the newly
      // created vendor job rather than leaving it billable in the background.
      await this.cancelVendorJob(
        t,
        externalId,
        channelResourceUid,
        channelRevisionId,
        channelRoute,
        credentialId,
      );
      await this.terminal.finalizeInvokeRequest(requestId, { status: 'cancelled' });
    }
  }

  private async cancelVendorJob(
    task: ClaimedTask,
    externalTaskId?: string,
    channelResourceUid?: string,
    channelRevisionId?: string,
    channelRoute?: ChannelRouteSnapshot,
    credentialId?: string,
  ): Promise<void> {
    if (
      !externalTaskId ||
      !channelResourceUid ||
      !channelRevisionId ||
      !channelRoute ||
      !credentialId
    )
      return;
    await this.invoke
      .cancel({
        ...requireTaskModelPin(task),
        task_id: task.id,
        external_task_id: externalTaskId,
        model_id: task.model_id,
        workspace_id: task.workspace_id,
        owner_id: task.owner_id,
        project_id: task.project_id ?? undefined,
        channel_resource_uid: channelResourceUid,
        channel_revision_id: channelRevisionId,
        channel_route: channelRoute,
        credential_id: credentialId,
      })
      .catch(() => undefined);
  }

  private async handleFailed(
    t: ClaimedTask,
    code: string,
    message: string,
    allowRedispatch = true,
  ): Promise<void> {
    const decision = allowRedispatch
      ? decideRetry(code, t.retry_count)
      : { retry: false, delay_ms: 0, max_attempts: 0 };
    if (decision.retry) {
      await this.tasks.scheduleRetry(
        t.id,
        t.lease_token,
        code,
        message,
        new Date(Date.now() + decision.delay_ms),
      );
      return;
    }
    await this.terminal.fail(t.id, t.lease_token, code, message);
  }
}

function taskError(error: unknown): {
  code: string;
  message: string;
  requestId?: string;
  allowRedispatch: boolean;
} {
  const requestId = (error as { request_id?: string } | null)?.request_id;
  const vendorCompleted = Boolean(
    (error as { accepted_result?: Record<string, unknown> } | null)?.accepted_result,
  );
  const dispatchOutcome = (
    error as { dispatch_outcome?: 'definitely_rejected' | 'outcome_unknown' | 'accepted' } | null
  )?.dispatch_outcome;
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const body =
      typeof response === 'object' && response !== null
        ? (response as { code?: string; message?: string | string[] })
        : undefined;
    const message = Array.isArray(body?.message)
      ? body.message.join('; ')
      : (body?.message ?? (typeof response === 'string' ? response : error.message));
    const statusCode = error.getStatus();
    const code =
      body?.code ??
      (statusCode === 400
        ? 'VALIDATION_FAILED'
        : statusCode === 403
          ? 'FORBIDDEN'
          : statusCode === 404
            ? 'NOT_FOUND'
            : 'INTERNAL_ERROR');
    return { code, message: redactSecretText(message), requestId, allowRedispatch: true };
  }
  return {
    code: vendorCompleted
      ? ((error as { code?: string } | null)?.code ?? 'ASSET_DOWNLOAD_FAILED')
      : dispatchOutcome === 'outcome_unknown' || dispatchOutcome === 'accepted'
        ? 'INVOKE_OUTCOME_UNKNOWN'
        : ((error as { code?: string } | null)?.code ?? 'INTERNAL_ERROR'),
    message: redactSecretText(error instanceof Error ? error.message : String(error)),
    requestId,
    allowRedispatch: !vendorCompleted,
  };
}
