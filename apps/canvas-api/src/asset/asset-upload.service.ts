import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { type AssetType, type AssetVisibility } from '@xgcanvas/shared-types';

import { AuthzService } from '../authz/authz.service';
import { Asset, AssetUploadDraft, Project } from '../database/entities';
import { PresignedUrlService } from '../storage/presigned-url.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { AssetUploadCleanupService } from './asset-upload-cleanup.service';
import {
  buildFinalKey,
  buildUploadKey,
  MAX_THUMB_BYTES,
  MAX_UPLOAD_BYTES,
  normaliseMime,
  validateUpload,
} from './asset-upload.utils';

export { MAX_THUMB_BYTES, MAX_UPLOAD_BYTES } from './asset-upload.utils';
const INTENT_TTL_MS = 60 * 60 * 1000;
const PUT_URL_TTL_SEC = 15 * 60;

export interface UploadIntentInput {
  type: AssetType;
  mime_type: string;
  bytes: number;
  name?: string;
  project_id?: string;
  visibility?: AssetVisibility;
  with_thumbnail?: boolean;
}

export interface CompleteUploadInput {
  width?: number;
  height?: number;
  duration_ms?: number;
  has_thumbnail?: boolean;
}

@Injectable()
export class AssetUploadService {
  private readonly logger = new Logger(AssetUploadService.name);

  constructor(
    @InjectRepository(Asset) private readonly assets: Repository<Asset>,
    @InjectRepository(AssetUploadDraft) private readonly drafts: Repository<AssetUploadDraft>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    private readonly workspaces: WorkspaceService,
    private readonly urls: PresignedUrlService,
    private readonly authz: AuthzService,
    private readonly cleanup: AssetUploadCleanupService,
    private readonly ds: DataSource,
  ) {}

  async createIntent(userId: string, workspaceId: string, input: UploadIntentInput) {
    const mimeType = normaliseMime(input.mime_type);
    validateUpload(input, mimeType);
    await this.workspaces.assertMember(userId, workspaceId);
    await this.assertCreatePolicy(userId, workspaceId, input.project_id, input.visibility);

    const visibility = input.visibility ?? (input.project_id ? 'project' : 'private');
    const draftId = randomUUID();
    const storageKey = buildUploadKey(workspaceId, draftId, input.name, mimeType);
    const draft = this.drafts.create({
      id: draftId,
      owner_id: userId,
      workspace_id: workspaceId,
      project_id: input.project_id ?? null,
      visibility,
      type: input.type,
      mime_type: mimeType,
      bytes: input.bytes,
      name: input.name?.trim().slice(0, 200) || null,
      storage_key: storageKey,
      thumb_storage_key: input.with_thumbnail
        ? `xgcanvas/staging/uploads/${workspaceId}/${draftId}/thumb.jpg`
        : null,
      status: 'pending',
      expires_at: new Date(Date.now() + INTENT_TTL_MS),
    });
    const allocated = await this.drafts.save(draft);

    const [uploadUrl, thumbUploadUrl] = await Promise.all([
      this.urls.putObject(allocated.storage_key, PUT_URL_TTL_SEC, mimeType),
      allocated.thumb_storage_key
        ? this.urls.putObject(allocated.thumb_storage_key, PUT_URL_TTL_SEC, 'image/jpeg')
        : Promise.resolve(undefined),
    ]);
    return {
      draft_id: allocated.id,
      upload_url: uploadUrl,
      thumb_upload_url: thumbUploadUrl,
      expires_in: PUT_URL_TTL_SEC,
    };
  }

  async complete(userId: string, draftId: string, input: CompleteUploadInput): Promise<Asset> {
    const materialized = await this.assets.findOne({ where: { upload_draft_id: draftId } });
    if (materialized) return this.assertMaterializedOwner(materialized, userId);

    const promoted: string[] = [];
    let result: Asset;
    try {
      result = await this.ds.transaction(async (manager) => {
        const draftRepo = manager.getRepository(AssetUploadDraft);
        const assetRepo = manager.getRepository(Asset);
        const locked = await draftRepo.findOne({
          where: { id: draftId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked)
          throw new NotFoundException({ code: 'NOT_FOUND', message: 'upload intent not found' });
        if (locked.owner_id !== userId) {
          throw new ForbiddenException({ code: 'FORBIDDEN', message: 'not your upload intent' });
        }
        const existing = await assetRepo.findOne({ where: { upload_draft_id: draftId } });
        if (existing) return this.assertMaterializedOwner(existing, userId);
        if (locked.status !== 'pending' || locked.expires_at.getTime() <= Date.now()) {
          throw new GoneException({ code: 'UPLOAD_EXPIRED', message: 'upload intent expired' });
        }

        await this.workspaces.assertMember(userId, locked.workspace_id);
        await this.assertCreatePolicy(
          userId,
          locked.workspace_id,
          locked.project_id ?? undefined,
          locked.visibility,
        );
        const sourceHead = await this.urls.headObject(locked.storage_key);
        try {
          this.assertSourceMatches(locked, sourceHead);
        } catch (error) {
          await this.discardObjects(locked);
          throw error;
        }

        const finalKey = buildFinalKey(locked, false);
        await this.promoteObject(locked.storage_key, finalKey, sourceHead!, promoted);
        const finalHead = await this.urls.headObject(finalKey);
        this.assertSourceMatches(locked, finalHead);
        const thumbKey = await this.promoteThumbnail(locked, !!input.has_thumbnail, promoted);
        const bucket = await this.urls.bucket();

        const saved = await assetRepo.save(
          assetRepo.create({
            type: locked.type,
            scope: locked.project_id ? 'project' : 'workspace',
            visibility: locked.visibility,
            workspace_id: locked.workspace_id,
            project_id: locked.project_id,
            owner_id: locked.owner_id,
            task_id: null,
            upload_draft_id: locked.id,
            storage_key: finalKey,
            bucket,
            origin_url: null,
            thumb_storage_key: thumbKey,
            mime_type: locked.mime_type,
            bytes: finalHead!.size_bytes,
            width: input.width ?? null,
            height: input.height ?? null,
            duration_ms: input.duration_ms ?? null,
            checksum_sha256: null,
            name: locked.name,
            tags: [],
            role: null,
            deleted_at: null,
          }),
        );
        locked.status = 'completed';
        await draftRepo.save(locked);
        return saved;
      });
    } catch (error) {
      await this.discardKeys(promoted);
      throw error;
    }
    await this.cleanup.cleanCompleted(draftId);
    return result;
  }

  private async assertCreatePolicy(
    userId: string,
    workspaceId: string,
    projectId?: string,
    visibility?: AssetVisibility,
  ) {
    if (
      visibility === 'workspace' &&
      !(await this.authz.can(userId, 'system.content.manage', 'system', null))
    ) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: '缺少工作区公共内容管理权限' });
    }
    if (projectId) {
      const project = await this.projects.findOne({ where: { id: projectId } });
      if (!project || project.workspace_id !== workspaceId) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: '目标项目不在当前工作区' });
      }
      if (!(await this.authz.can(userId, 'project.asset.create', 'project', projectId))) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: '缺少项目资产创建权限' });
      }
      return;
    }
    if (visibility === 'project') {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'project visibility requires project_id',
      });
    }
  }

  private assertMaterializedOwner(asset: Asset, userId: string): Asset {
    if (asset.owner_id !== userId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'not your upload intent' });
    }
    return asset;
  }

  private assertSourceMatches(
    draft: AssetUploadDraft,
    head: { size_bytes: number; mime_type?: string; etag?: string } | null,
  ): void {
    if (!head) {
      throw new BadRequestException({
        code: 'UPLOAD_NOT_FOUND',
        message: 'object not uploaded yet',
      });
    }
    if (
      head.size_bytes !== draft.bytes ||
      head.size_bytes > MAX_UPLOAD_BYTES ||
      normaliseMime(head.mime_type ?? '') !== draft.mime_type
    ) {
      throw new BadRequestException({
        code: 'UPLOAD_MISMATCH',
        message: 'uploaded object does not match the declared size or content type',
      });
    }
  }

  private async promoteThumbnail(
    draft: AssetUploadDraft,
    requested: boolean,
    promoted: string[],
  ): Promise<string | null> {
    if (!draft.thumb_storage_key) return null;
    if (!requested) return null;
    const head = await this.urls.headObject(draft.thumb_storage_key);
    if (!head) return null;
    if (
      head.size_bytes <= 0 ||
      head.size_bytes > MAX_THUMB_BYTES ||
      normaliseMime(head.mime_type ?? '') !== 'image/jpeg'
    ) {
      return null;
    }
    const finalKey = buildFinalKey(draft, true);
    await this.promoteObject(draft.thumb_storage_key, finalKey, head, promoted);
    return finalKey;
  }

  private async promoteObject(
    sourceKey: string,
    finalKey: string,
    head: { etag?: string },
    promoted: string[],
  ): Promise<void> {
    if (!head.etag) {
      throw new BadRequestException({
        code: 'UPLOAD_UNVERIFIABLE',
        message: 'storage did not return an ETag',
      });
    }
    await this.urls.copyObject(sourceKey, finalKey, head.etag);
    promoted.push(finalKey);
  }

  private async discardObjects(draft: AssetUploadDraft): Promise<void> {
    await this.discardKeys([
      draft.storage_key,
      ...(draft.thumb_storage_key ? [draft.thumb_storage_key] : []),
    ]);
  }

  private async discardKeys(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.deleteBestEffort(key)));
  }

  private async deleteBestEffort(key: string): Promise<void> {
    try {
      await this.urls.deleteObject(key);
    } catch (error) {
      this.logger.warn(
        `Failed to delete upload object ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
