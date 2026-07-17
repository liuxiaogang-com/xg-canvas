import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AccountInvokeClient } from '../account-client';
import { Task } from '../database/entities';
import { decideRetry } from './retry-policy';
import { type ClaimedTask, TaskService } from './task.service';
import { TaskTerminalService } from './task-terminal.service';
import { requireTaskModelPin } from './task-model-pin';

/** Default max wall-clock for async vendor jobs (Dreamina video can be slow). */
const DEFAULT_RUNNING_TIMEOUT_MS = 45 * 60 * 1000;
const MAX_TRANSIENT_POLL_FAILS = 12;

@Injectable()
export class TaskPollerService {
  private readonly logger = new Logger(TaskPollerService.name);
  private readonly runningTimeoutMs: number;

  constructor(
    private readonly tasks: TaskService,
    private readonly invoke: AccountInvokeClient,
    private readonly terminal: TaskTerminalService,
    config: ConfigService,
  ) {
    this.runningTimeoutMs = nonNegativeInteger(
      config,
      'TASK_RUNNING_TIMEOUT_MS',
      DEFAULT_RUNNING_TIMEOUT_MS,
      24 * 60 * 60 * 1000,
    );
  }

  async pollOne(t: ClaimedTask, signal?: AbortSignal): Promise<void> {
    if (!t.external_task_id) return;
    if (!t.channel_resource_uid || !t.channel_revision_id || !t.channel_route || !t.credential_id) {
      await this.failTerminal(
        t,
        'TASK_ROUTING_METADATA_MISSING',
        '异步任务缺少固定 Channel Revision、路由或 Credential，无法继续轮询',
      );
      return;
    }

    if (isRunningTimedOut(t, this.runningTimeoutMs)) {
      await this.failTerminal(
        t,
        'VENDOR_TIMEOUT',
        `任务运行超时（超过 ${Math.round(this.runningTimeoutMs / 60_000)} 分钟），请重试`,
      );
      return;
    }

    try {
      const r = await this.invoke.poll(
        {
          ...requireTaskModelPin(t),
          task_id: t.id,
          external_task_id: t.external_task_id!,
          model_id: t.model_id,
          workspace_id: t.workspace_id,
          owner_id: t.owner_id,
          project_id: t.project_id ?? undefined,
          channel_resource_uid: t.channel_resource_uid,
          channel_revision_id: t.channel_revision_id,
          channel_route: t.channel_route,
          credential_id: t.credential_id,
        },
        signal,
      );

      const res = r.response;
      if (res.status === 'running') {
        await this.tasks.releasePoll(t.id, t.lease_token, {
          progress: res.progress ?? t.progress,
          error: undefined,
          next_poll_at: new Date(Date.now() + (r.next_poll_after_ms ?? 3000)),
        });
        return;
      }
      if (res.status === 'succeeded') {
        await this.terminal.succeed(t.id, t.lease_token, {
          assets: res.assets,
          text: res.text,
          json: res.json,
          usage: res.usage,
        });
        return;
      }
      await this.failOrRetry(
        t,
        res.error?.code ?? 'VENDOR_REJECTED',
        res.error?.message ?? 'failed',
        res.usage,
      );
    } catch (e) {
      const code = (e as { code?: string }).code ?? 'INTERNAL_ERROR';
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`poll task ${t.id} threw: ${code} ${msg}`);
      if (isPermanentPollError(code, msg)) {
        await this.failTerminal(t, code, msg);
        return;
      }

      const pollFails = pollFailStreak(t.error) + 1;
      if (pollFails >= MAX_TRANSIENT_POLL_FAILS) {
        await this.failTerminal(t, code, `轮询连续失败 ${pollFails} 次：${msg}`);
        return;
      }

      const decision = decideRetry(code, t.retry_count);
      if (decision.retry && code === 'ASSET_DOWNLOAD_FAILED') {
        await this.tasks.schedulePollRetry(
          t.id,
          t.lease_token,
          code,
          msg,
          new Date(Date.now() + decision.delay_ms),
        );
        return;
      }

      await this.tasks.releasePoll(t.id, t.lease_token, {
        error: { code, message: msg, vendor: { poll_fails: pollFails } },
        next_poll_at: new Date(Date.now() + 5000),
      });
    }
  }

  private async failOrRetry(
    t: ClaimedTask,
    code: string,
    message: string,
    usage?: Record<string, unknown> | null,
  ): Promise<void> {
    const decision = decideRetry(code, t.retry_count);
    if (decision.retry) {
      if (t.invoke_request_id) {
        await this.terminal.finalizeInvokeRequest(t.invoke_request_id, {
          status: 'error',
          usage,
          error_code: code,
          error_message: message,
        });
      }
      await this.tasks.scheduleRetry(
        t.id,
        t.lease_token,
        code,
        message,
        new Date(Date.now() + decision.delay_ms),
      );
      return;
    }
    await this.failTerminal(t, code, message);
  }

  private async failTerminal(t: ClaimedTask, code: string, message: string): Promise<void> {
    await this.terminal.fail(t.id, t.lease_token, code, message);
  }
}

function isRunningTimedOut(t: Task, timeoutMs: number): boolean {
  if (!t.started_at || timeoutMs <= 0) return false;
  return Date.now() - new Date(t.started_at).getTime() > timeoutMs;
}

function isPermanentPollError(code: string, message: string): boolean {
  if (
    code === 'CONSTRAINT_VIOLATION' ||
    code === 'VENDOR_REJECTED' ||
    code === 'CLI_INVOCATION_FAILED' ||
    code === 'CATALOG_REVISION_MISSING'
  ) {
    return true;
  }
  const m = message.toLowerCase();
  return (
    m.includes('record not found') ||
    m.includes('query_result parse failed') ||
    m.includes('no submit_id')
  );
}

function pollFailStreak(error: Task['error']): number {
  if (!error?.vendor || typeof error.vendor !== 'object') return 0;
  const n = (error.vendor as { poll_fails?: unknown }).poll_fails;
  return typeof n === 'number' && n > 0 ? n : 0;
}

function nonNegativeInteger(
  config: ConfigService,
  key: string,
  fallback: number,
  max: number,
): number {
  const raw = config.get<string>(key);
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`${key} must be an integer between 0 and ${max}`);
  }
  return value;
}
