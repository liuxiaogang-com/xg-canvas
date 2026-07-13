import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';

import { AssetUploadDraft } from '../database/entities';
import { PresignedUrlService } from '../storage/presigned-url.service';

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const CLEANUP_BATCH = 100;

@Injectable()
export class AssetUploadCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AssetUploadCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(AssetUploadDraft) private readonly drafts: Repository<AssetUploadDraft>,
    private readonly urls: PresignedUrlService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.runSafely(), CLEANUP_INTERVAL_MS);
    this.timer.unref();
    void this.runSafely();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(): Promise<void> {
    const claimResult: unknown = await this.drafts.query(
      `WITH picked AS (
         SELECT id
           FROM canvas.asset_upload_drafts
          WHERE status = 'pending' AND expires_at < NOW()
          ORDER BY expires_at ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
       )
       UPDATE canvas.asset_upload_drafts d
          SET status = 'expired', updated_at = NOW()
         FROM picked
        WHERE d.id = picked.id
       RETURNING d.*`,
      [CLEANUP_BATCH],
    );
    const claimed = claimedRows(claimResult);
    const [retries, completed] = await Promise.all([
      this.drafts.find({
        where: { status: 'expired', expires_at: LessThan(new Date()) },
        order: { expires_at: 'ASC' },
        take: CLEANUP_BATCH,
      }),
      this.drafts.find({
        where: { status: 'completed', staging_cleaned_at: IsNull() },
        order: { updated_at: 'ASC' },
        take: CLEANUP_BATCH,
      }),
    ]);
    const rows = [...new Map([...claimed, ...retries].map((row) => [row.id, row])).values()];
    for (const row of rows.slice(0, CLEANUP_BATCH)) await this.cleanExpired(row);
    for (const row of completed) await this.cleanCompletedRow(row);
  }

  private async runSafely(): Promise<void> {
    try {
      await this.runOnce();
    } catch (error) {
      // Cleanup is maintenance work. A transient database/schema/storage
      // problem must not become an unhandled rejection that exits the API.
      this.logger.error(`Upload cleanup pass failed: ${messageOf(error)}`);
    }
  }

  /** Immediate post-commit cleanup; failures remain visible to runOnce(). */
  async cleanCompleted(draftId: string): Promise<void> {
    const row = await this.drafts.findOne({
      where: { id: draftId, status: 'completed', staging_cleaned_at: IsNull() },
    });
    if (row) await this.cleanCompletedRow(row);
  }

  private async cleanExpired(row: AssetUploadDraft): Promise<void> {
    try {
      await this.deleteStaging(row);
      await this.drafts.delete({ id: row.id, status: 'expired' });
    } catch (error) {
      this.logger.warn(`Failed to clean expired upload draft ${row.id}: ${messageOf(error)}`);
    }
  }

  private async cleanCompletedRow(row: AssetUploadDraft): Promise<void> {
    try {
      await this.deleteStaging(row);
      await this.drafts.update(
        { id: row.id, status: 'completed', staging_cleaned_at: IsNull() },
        { staging_cleaned_at: new Date() },
      );
    } catch (error) {
      this.logger.warn(`Failed to clean completed upload draft ${row.id}: ${messageOf(error)}`);
    }
  }

  private async deleteStaging(row: AssetUploadDraft): Promise<void> {
    await this.urls.deleteObject(row.storage_key);
    if (row.thumb_storage_key) await this.urls.deleteObject(row.thumb_storage_key);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** TypeORM/Postgres may return UPDATE results as rows or as [rows, affected]. */
function claimedRows(result: unknown): AssetUploadDraft[] {
  const candidates =
    Array.isArray(result) && result.length === 2 && Array.isArray(result[0])
      ? result[0]
      : Array.isArray(result)
        ? result
        : isRecord(result) && Array.isArray(result.records)
          ? result.records
          : [];
  if (!candidates.every(isClaimedDraft)) {
    throw new Error('upload cleanup claim returned malformed rows');
  }
  return candidates;
}

function isClaimedDraft(value: unknown): value is AssetUploadDraft {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.storage_key === 'string' &&
    value.storage_key.length > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
