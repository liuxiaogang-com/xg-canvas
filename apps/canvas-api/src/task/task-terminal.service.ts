import { Injectable, Logger } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { ChannelRouteSnapshot } from '@xgcanvas/shared-types';

import type { ProducedAsset } from '../account-client';
import { AccountInvokeClient } from '../account-client';
import { AssetService } from '../asset/asset.service';
import { Task } from '../database/entities';
import {
  RequestLogService,
  type FinalizePendingRequestLog,
} from '../request-log/request-log.service';
import { TaskNodeWritebackService } from './task-node-writeback.service';
import { requireTaskModelPin } from './task-model-pin';

export interface TaskSuccessResult {
  assets: ProducedAsset[];
  text?: string;
  json?: unknown;
  channel_resource_uid?: string;
  channel_revision_id?: string;
  channel_route?: ChannelRouteSnapshot;
  credential_id?: string;
  usage?: Record<string, unknown> | null;
}

/** Owns all terminal task transitions and their transactional projections. */
@Injectable()
export class TaskTerminalService {
  private readonly logger = new Logger(TaskTerminalService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly assets: AssetService,
    private readonly writeback: TaskNodeWritebackService,
    private readonly invoke: AccountInvokeClient,
    private readonly requestLogs: RequestLogService,
  ) {}

  async succeed(taskId: string, leaseToken: string, result: TaskSuccessResult): Promise<boolean> {
    try {
      const completed = await this.ds.transaction(async (manager) => {
        const task = await this.lockLeased(manager, taskId, leaseToken);
        if (!task) return null;
        const assetIds = await this.assets.persistProduced(task, result.assets, manager);
        const updated = await updateTerminal(manager, taskId, leaseToken, 'succeeded', {
          output_asset_ids: assetIds,
          text_output: result.text ?? null,
          json_output: result.json ?? null,
          progress: 1,
          error: null,
          channel_resource_uid: result.channel_resource_uid,
          channel_revision_id: result.channel_revision_id,
          channel_route: result.channel_route,
          credential_id: result.credential_id,
        });
        if (!updated) return null;
        await this.writeback.applyTerminal(updated, manager);
        if (updated.invoke_request_id) {
          const finalized = await this.requestLogs.finalizePending(
            updated.invoke_request_id,
            {
              status: 'success',
              usage: result.usage,
              response_body: { text: result.text ?? '' },
            },
            manager,
          );
          assertInvokeFinalized(updated.invoke_request_id, finalized);
        }
        return updated;
      });
      if (!completed) {
        await this.assets.discardProduced(result.assets);
        return false;
      }
      return true;
    } catch (error) {
      await this.assets.discardProduced(result.assets);
      throw error;
    }
  }

  async fail(taskId: string, leaseToken: string, code: string, message: string): Promise<boolean> {
    const task = await this.ds.transaction(async (manager) => {
      const task = await this.lockLeased(manager, taskId, leaseToken);
      if (!task) return null;
      const updated = await updateTerminal(manager, taskId, leaseToken, 'failed', {
        error: { code, message },
      });
      if (!updated) return null;
      await this.writeback.applyTerminal(updated, manager);
      if (updated.invoke_request_id) {
        const finalized = await this.requestLogs.finalizePending(
          updated.invoke_request_id,
          {
            status: code === 'VENDOR_TIMEOUT' ? 'timeout' : 'error',
            error_code: code,
            error_message: message,
          },
          manager,
        );
        assertInvokeFinalized(updated.invoke_request_id, finalized);
      }
      return updated;
    });
    if (!task) return false;
    this.cancelVendorBestEffort(task);
    return true;
  }

  async cancelByOwner(userId: string, taskId: string): Promise<Task | null> {
    const outcome = await this.ds.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT * FROM canvas.tasks WHERE id = $1 AND owner_id = $2 FOR UPDATE`,
        [taskId, userId],
      );
      const current = firstRow<Task>(rows);
      if (!current) return null;
      if (isTerminal(current.status)) return { task: current, transitioned: false };

      const updatedRows = await manager.query(
        `UPDATE canvas.tasks
            SET status = 'cancelled', finished_at = NOW(), next_poll_at = NULL,
                lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
          WHERE id = $1 AND owner_id = $2
            AND status IN ('pending', 'queued', 'running')
          RETURNING *`,
        [taskId, userId],
      );
      const updated = firstRow<Task>(updatedRows) ?? current;
      await this.writeback.applyTerminal(updated, manager);
      if (updated.status === 'cancelled' && updated.invoke_request_id) {
        const finalized = await this.requestLogs.finalizePending(
          updated.invoke_request_id,
          {
            status: 'cancelled',
          },
          manager,
        );
        assertInvokeFinalized(updated.invoke_request_id, finalized);
      }
      return { task: updated, transitioned: updated.status === 'cancelled' };
    });

    if (!outcome) return null;
    if (outcome.transitioned) {
      this.cancelVendorBestEffort(outcome.task);
    }
    return outcome.task;
  }

  async finalizeInvokeRequest(
    requestId: string,
    patch: FinalizePendingRequestLog,
  ): Promise<boolean> {
    return this.requestLogs.finalizePending(requestId, patch);
  }

  private async lockLeased(
    manager: EntityManager,
    taskId: string,
    leaseToken: string,
  ): Promise<Task | null> {
    const rows = await manager.query(
      `SELECT * FROM canvas.tasks
        WHERE id = $1 AND lease_token = $2
          AND status IN ('queued', 'running')
        FOR UPDATE`,
      [taskId, leaseToken],
    );
    return firstRow<Task>(rows) ?? null;
  }

  private cancelVendorBestEffort(task: Task): void {
    if (
      task.execution_mode !== 'live' ||
      !task.external_task_id ||
      !task.channel_resource_uid ||
      !task.channel_revision_id ||
      !task.channel_route ||
      !task.credential_id
    )
      return;
    this.invoke
      .cancel({
        ...requireTaskModelPin(task),
        task_id: task.id,
        external_task_id: task.external_task_id,
        model_id: task.model_id,
        workspace_id: task.workspace_id,
        owner_id: task.owner_id,
        project_id: task.project_id ?? undefined,
        channel_resource_uid: task.channel_resource_uid,
        channel_revision_id: task.channel_revision_id,
        channel_route: task.channel_route,
        credential_id: task.credential_id,
      })
      .catch((error) => {
        this.logger.warn(
          `vendor cancel failed for task ${task.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }
}

async function updateTerminal(
  manager: EntityManager,
  taskId: string,
  leaseToken: string,
  status: 'succeeded' | 'failed',
  patch: {
    output_asset_ids?: string[];
    text_output?: string | null;
    json_output?: unknown;
    progress?: number | null;
    error?: Task['error'];
    channel_resource_uid?: string;
    channel_revision_id?: string;
    channel_route?: ChannelRouteSnapshot;
    credential_id?: string;
  },
): Promise<Task | null> {
  const rows = await manager.query(
    `UPDATE canvas.tasks
        SET status = $3,
            output_asset_ids = COALESCE($4::uuid[], output_asset_ids),
            text_output = CASE WHEN $5::boolean THEN $6::text ELSE text_output END,
            json_output = CASE WHEN $7::boolean THEN $8::jsonb ELSE json_output END,
            progress = CASE WHEN $9::boolean THEN $10::real ELSE progress END,
            error = CASE WHEN $11::boolean THEN $12::jsonb ELSE error END,
            channel_resource_uid = COALESCE($13::uuid, channel_resource_uid),
            channel_revision_id = COALESCE($14::uuid, channel_revision_id),
            channel_route = COALESCE($15::jsonb, channel_route),
            credential_id = COALESCE($16::uuid, credential_id),
            finished_at = NOW(), next_poll_at = NULL,
            lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
      WHERE id = $1 AND lease_token = $2
        AND status IN ('queued', 'running')
      RETURNING *`,
    [
      taskId,
      leaseToken,
      status,
      patch.output_asset_ids ?? null,
      'text_output' in patch,
      patch.text_output ?? null,
      'json_output' in patch,
      patch.json_output == null ? null : JSON.stringify(patch.json_output),
      'progress' in patch,
      patch.progress ?? null,
      'error' in patch,
      patch.error == null ? null : JSON.stringify(patch.error),
      patch.channel_resource_uid ?? null,
      patch.channel_revision_id ?? null,
      patch.channel_route ? JSON.stringify(patch.channel_route) : null,
      patch.credential_id ?? null,
    ],
  );
  return firstRow<Task>(rows) ?? null;
}

function firstRow<T>(result: unknown): T | undefined {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  ) {
    return result[0][0] as T | undefined;
  }
  return Array.isArray(result) ? (result[0] as T | undefined) : undefined;
}

function isTerminal(status: string): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}

function assertInvokeFinalized(requestId: string, finalized: boolean): void {
  if (!finalized) throw new Error(`pending invoke request log is missing: ${requestId}`);
}
