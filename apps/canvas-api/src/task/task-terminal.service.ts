import { Injectable, Logger } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

import type { ProducedAsset } from '../account-client';
import { AccountInvokeClient } from '../account-client';
import { AssetService } from '../asset/asset.service';
import { Task } from '../database/entities';
import { TaskNodeWritebackService } from './task-node-writeback.service';

export interface TaskSuccessResult {
  assets: ProducedAsset[];
  text?: string;
  json?: unknown;
  channel_id?: string;
  credential_id?: string;
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
  ) {}

  async succeed(taskId: string, leaseToken: string, result: TaskSuccessResult): Promise<boolean> {
    try {
      const committed = await this.ds.transaction(async (manager) => {
        const task = await this.lockLeased(manager, taskId, leaseToken);
        if (!task) return false;
        const assetIds = await this.assets.persistProduced(task, result.assets, manager);
        const updated = await updateTerminal(manager, taskId, leaseToken, 'succeeded', {
          output_asset_ids: assetIds,
          text_output: result.text ?? null,
          json_output: result.json ?? null,
          progress: 1,
          error: null,
          channel_id: result.channel_id,
          credential_id: result.credential_id,
        });
        if (!updated) return false;
        await this.writeback.applyTerminal(updated, manager);
        return true;
      });
      if (!committed) await this.assets.discardProduced(result.assets);
      return committed;
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
      return { task: updated, transitioned: updated.status === 'cancelled' };
    });

    if (!outcome) return null;
    if (outcome.transitioned) this.cancelVendorBestEffort(outcome.task);
    return outcome.task;
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
    if (!task.external_task_id || !task.channel_id || !task.credential_id) return;
    this.invoke
      .cancel({
        external_task_id: task.external_task_id,
        model_id: task.model_id,
        channel_id: task.channel_id,
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
    channel_id?: string;
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
            channel_id = COALESCE($13::uuid, channel_id),
            credential_id = COALESCE($14::uuid, credential_id),
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
      patch.channel_id ?? null,
      patch.credential_id ?? null,
    ],
  );
  return firstRow<Task>(rows) ?? null;
}

function firstRow<T>(result: unknown): T | undefined {
  if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0]) && typeof result[1] === 'number') {
    return result[0][0] as T | undefined;
  }
  return Array.isArray(result) ? (result[0] as T | undefined) : undefined;
}

function isTerminal(status: string): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}
