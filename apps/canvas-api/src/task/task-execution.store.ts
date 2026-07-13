import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import type { Task } from '../database/entities';

const DEFAULT_LEASE_MS = 120_000;

export type ClaimedTask = Task & { lease_token: string; lease_expires_at: Date };

/** PostgreSQL CAS/lease persistence kept separate from TaskService policy. */
@Injectable()
export class TaskExecutionStore {
  constructor(private readonly ds: DataSource) {}

  async claimPending(limit: number, leaseMs = DEFAULT_LEASE_MS): Promise<ClaimedTask[]> {
    const result = await this.ds.query(
      `WITH picked AS (
         SELECT id
           FROM canvas.tasks
          WHERE external_task_id IS NULL
            AND (
              status = 'pending'
              OR (
                status = 'queued'
                AND (next_poll_at IS NULL OR next_poll_at <= NOW())
                AND (lease_token IS NULL OR lease_expires_at <= NOW())
              )
              OR (
                status = 'running'
                AND (lease_token IS NULL OR lease_expires_at <= NOW())
              )
            )
          ORDER BY created_at ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
       )
       UPDATE canvas.tasks t
          SET status = 'queued',
              attempt_no = CASE WHEN t.lease_token IS NULL THEN t.attempt_no + 1 ELSE t.attempt_no END,
              lease_token = gen_random_uuid(),
              lease_expires_at = NOW() + ($2::int * INTERVAL '1 millisecond'),
              next_poll_at = NULL,
              updated_at = NOW()
         FROM picked
        WHERE t.id = picked.id
        RETURNING t.*`,
      [limit, leaseMs],
    );
    return rowsOf<ClaimedTask>(result);
  }

  async claimDuePolls(limit: number, leaseMs = DEFAULT_LEASE_MS): Promise<ClaimedTask[]> {
    const result = await this.ds.query(
      `WITH picked AS (
         SELECT id
           FROM canvas.tasks
          WHERE status = 'running'
            AND external_task_id IS NOT NULL
            AND (next_poll_at IS NULL OR next_poll_at <= NOW())
            AND (lease_token IS NULL OR lease_expires_at <= NOW())
          ORDER BY next_poll_at ASC NULLS FIRST
          LIMIT $1
          FOR UPDATE SKIP LOCKED
       )
       UPDATE canvas.tasks t
          SET lease_token = gen_random_uuid(),
              lease_expires_at = NOW() + ($2::int * INTERVAL '1 millisecond'),
              updated_at = NOW()
         FROM picked
        WHERE t.id = picked.id
        RETURNING t.*`,
      [limit, leaseMs],
    );
    return rowsOf<ClaimedTask>(result);
  }

  async startClaimed(task: ClaimedTask, leaseMs = DEFAULT_LEASE_MS): Promise<ClaimedTask | null> {
    const rows = await this.ds.query(
      `UPDATE canvas.tasks
          SET status = 'running', started_at = COALESCE(started_at, NOW()),
              lease_expires_at = NOW() + ($3::int * INTERVAL '1 millisecond'), updated_at = NOW()
        WHERE id = $1 AND lease_token = $2 AND status = 'queued'
        RETURNING *`,
      [task.id, task.lease_token, leaseMs],
    );
    return firstRow<ClaimedTask>(rows) ?? null;
  }

  async renewLease(id: string, leaseToken: string, leaseMs = DEFAULT_LEASE_MS): Promise<boolean> {
    const rows = await this.ds.query(
      `UPDATE canvas.tasks
          SET lease_expires_at = NOW() + ($3::int * INTERVAL '1 millisecond'), updated_at = NOW()
        WHERE id = $1 AND lease_token = $2 AND status IN ('queued', 'running')
        RETURNING id`,
      [id, leaseToken, leaseMs],
    );
    return Boolean(firstRow(rows));
  }

  async saveExternalResult(
    id: string,
    leaseToken: string,
    patch: {
      external_task_id: string;
      channel_id?: string;
      credential_id?: string;
      next_poll_at: Date;
    },
  ): Promise<boolean> {
    const rows = await this.ds.query(
      `UPDATE canvas.tasks
          SET external_task_id = $3,
              channel_id = COALESCE($4::uuid, channel_id),
              credential_id = COALESCE($5::uuid, credential_id),
              next_poll_at = $6,
              lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
        WHERE id = $1 AND lease_token = $2 AND status = 'running'
        RETURNING id`,
      [id, leaseToken, patch.external_task_id, patch.channel_id ?? null, patch.credential_id ?? null, patch.next_poll_at],
    );
    return Boolean(firstRow(rows));
  }

  async releasePoll(
    id: string,
    leaseToken: string,
    patch: { progress?: number | null; error?: Task['error']; next_poll_at: Date },
  ): Promise<boolean> {
    const rows = await this.ds.query(
      `UPDATE canvas.tasks
          SET progress = COALESCE($3::real, progress),
              error = $4::jsonb,
              next_poll_at = $5,
              lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
        WHERE id = $1 AND lease_token = $2 AND status = 'running'
        RETURNING id`,
      [id, leaseToken, patch.progress ?? null, patch.error ? JSON.stringify(patch.error) : null, patch.next_poll_at],
    );
    return Boolean(firstRow(rows));
  }

  async scheduleRetry(
    id: string,
    leaseToken: string,
    code: string,
    message: string,
    nextAttemptAt: Date,
  ): Promise<boolean> {
    const rows = await this.ds.query(
      `UPDATE canvas.tasks
          SET status = 'queued', external_task_id = NULL, channel_id = NULL, credential_id = NULL,
              progress = NULL, error = $3::jsonb, retry_count = retry_count + 1,
              started_at = NULL, next_poll_at = $4,
              lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
        WHERE id = $1 AND lease_token = $2 AND status IN ('queued', 'running')
        RETURNING id`,
      [id, leaseToken, JSON.stringify({ code, message }), nextAttemptAt],
    );
    return Boolean(firstRow(rows));
  }

  async schedulePollRetry(
    id: string,
    leaseToken: string,
    code: string,
    message: string,
    nextPollAt: Date,
  ): Promise<boolean> {
    const rows = await this.ds.query(
      `UPDATE canvas.tasks
          SET error = $3::jsonb, retry_count = retry_count + 1, next_poll_at = $4,
              lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
        WHERE id = $1 AND lease_token = $2 AND status = 'running'
          AND external_task_id IS NOT NULL
        RETURNING id`,
      [id, leaseToken, JSON.stringify({ code, message }), nextPollAt],
    );
    return Boolean(firstRow(rows));
  }
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0]) && typeof result[1] === 'number') {
    return result[0] as T[];
  }
  return Array.isArray(result) ? (result as T[]) : [];
}

function firstRow<T>(result: unknown): T | undefined {
  return rowsOf<T>(result)[0];
}
