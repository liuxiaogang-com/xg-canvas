import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, Repository } from 'typeorm';
import type { AssetType } from '@xgcanvas/shared-types';

import type { ProducedAsset } from '../account-client';
import { AuthzService } from '../authz/authz.service';
import { Asset, Project, Task } from '../database/entities';
import { PresignedUrlService } from '../storage/presigned-url.service';
import { WorkspaceService } from '../workspace/workspace.service';

const THUMB_PUT_TTL_SEC = 900;

export interface AssetListQuery {
  workspace_id: string;
  project_id?: string | 'global';
  type?: AssetType;
  limit?: number;
  before?: string;
  /** 'me' restricts to the caller's own assets. */
  owner?: 'me';
  favorited?: boolean;
  tags?: string[];
  /** upload = user uploads (task_id IS NULL); task = generation outputs. */
  source?: 'upload' | 'task';
  /** Fuzzy match on name. */
  q?: string;
}

@Injectable()
export class AssetService {
  private readonly logger = new Logger(AssetService.name);

  constructor(
    @InjectRepository(Asset) private readonly assets: Repository<Asset>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    private readonly workspaces: WorkspaceService,
    private readonly authz: AuthzService,
    private readonly urls: PresignedUrlService,
  ) {}

  /**
   * Persist account-api ProducedAsset[] as canvas.assets rows.
   * The object bytes already exist; we only write metadata.
   */
  async persistProduced(
    t: Task,
    produced: ProducedAsset[],
    manager?: EntityManager,
  ): Promise<string[]> {
    if (produced.length === 0) return [];
    const repo = manager?.getRepository(Asset) ?? this.assets;
    const rows = produced.map((p) =>
      repo.create({
        type: p.asset_type,
        scope: t.project_id ? 'project' : 'workspace',
        visibility: t.project_id ? 'project' : 'private',
        workspace_id: t.workspace_id,
        project_id: t.project_id,
        owner_id: t.owner_id,
        task_id: t.id,
        storage_key: p.storage.storage_key,
        bucket: p.storage.bucket,
        mime_type: p.storage.mime_type,
        bytes: p.storage.size_bytes,
        width: p.storage.width ?? null,
        height: p.storage.height ?? null,
        duration_ms: p.storage.duration_ms ?? null,
        checksum_sha256: p.storage.sha256,
        role: p.role ?? null,
        tags: [],
      }),
    );
    const saved = await repo.save(rows);
    return saved.map((s) => s.id);
  }

  /** Compensate object-store writes when terminal CAS/transaction loses. */
  async discardProduced(produced: ProducedAsset[]): Promise<void> {
    const keys = [...new Set(produced.map((item) => item.storage.storage_key))];
    const results = await Promise.allSettled(keys.map((key) => this.urls.deleteObject(key)));
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const detail = result.reason instanceof Error ? result.reason.message : String(result.reason);
        this.logger.warn(`Failed to discard orphaned object ${keys[index]}: ${detail}`);
      }
    });
  }

  /**
   * Visibility-aware list. Regardless of the requested view, a user only ever
   * sees: own assets ∪ workspace-visible assets ∪ project-visible assets of
   * projects where they hold project.asset.view.
   */
  async list(userId: string, q: AssetListQuery): Promise<Asset[]> {
    await this.workspaces.assertMember(userId, q.workspace_id);
    const qb = this.assets
      .createQueryBuilder('a')
      .where('a.workspace_id = :wid', { wid: q.workspace_id })
      .andWhere('a.deleted_at IS NULL')
      .orderBy('a.created_at', 'DESC')
      .limit(Math.min(q.limit ?? 60, 200));
    if (q.project_id === 'global') qb.andWhere('a.project_id IS NULL');
    else if (q.project_id) qb.andWhere('a.project_id = :pid', { pid: q.project_id });
    if (q.type) qb.andWhere('a.type = :t', { t: q.type });
    if (q.before) qb.andWhere('a.created_at < :b', { b: q.before });
    if (q.owner === 'me') qb.andWhere('a.owner_id = :owner', { owner: userId });
    if (q.source === 'upload') qb.andWhere('a.task_id IS NULL');
    else if (q.source === 'task') qb.andWhere('a.task_id IS NOT NULL');
    if (q.tags?.length) qb.andWhere('a.tags && :tags', { tags: q.tags });
    if (q.q) qb.andWhere('a.name ILIKE :name', { name: `%${q.q}%` });
    if (q.favorited) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM canvas.favorites f
           WHERE f.user_id = :fuid AND f.target_type = 'asset' AND f.target_id = a.id)`,
        { fuid: userId },
      );
    }

    const viewable = await this.authz.projectIdsWithCap(userId, 'project.asset.view');
    if (viewable !== 'ALL') {
      qb.andWhere(
        new Brackets((w) => {
          w.where('a.owner_id = :uid', { uid: userId }).orWhere("a.visibility = 'workspace'");
          if (viewable.length > 0) {
            w.orWhere("(a.visibility = 'project' AND a.project_id IN (:...vpids))", { vpids: viewable });
          }
        }),
      );
    } else {
      // System-wide viewers still don't see other people's private assets.
      qb.andWhere("(a.visibility != 'private' OR a.owner_id = :uid)", { uid: userId });
    }
    return qb.getMany();
  }

  /** Load an asset and assert the caller may read it. Minting a presigned URL
   *  must always go through here — issuing the URL is the authorization point. */
  async getOrThrow(userId: string, id: string, workspaceId?: string): Promise<Asset> {
    const a = await this.assets.findOne({ where: { id } });
    if (!a || a.deleted_at || (workspaceId && a.workspace_id !== workspaceId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'asset not found' });
    }
    await this.assertReadable(userId, a);
    return a;
  }

  async getInWorkspaceOrThrow(userId: string, id: string, workspaceId: string): Promise<Asset> {
    return this.getOrThrow(userId, id, workspaceId);
  }

  async assertReadable(userId: string, a: Asset): Promise<void> {
    if (a.visibility === 'project' && !a.project_id) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'asset not found' });
    }
    if (a.owner_id === userId) return;
    if (a.visibility === 'private') {
      if (!(await this.authz.isSuperOrOwner(userId))) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'asset not found' });
      }
      return;
    }
    if (a.visibility === 'project' && a.project_id) {
      const ok = await this.authz.can(userId, 'project.asset.view', 'project', a.project_id);
      if (!ok) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'no access to asset' });
      return;
    }
    // workspace-visible (or project visibility without a project row, which we
    // treat as workspace-level): any workspace member may read.
    await this.workspaces.assertMember(userId, a.workspace_id);
  }

  /** Batch read with per-id permission filtering: unauthorized ids are dropped
   *  silently so grid thumbnails never leak other users' assets. */
  async listReadable(userId: string, ids: string[], workspaceId?: string): Promise<Asset[]> {
    if (ids.length === 0) return [];
    const qb = this.assets
      .createQueryBuilder('a')
      .where('a.id IN (:...ids)', { ids })
      .andWhere('a.deleted_at IS NULL');
    if (workspaceId) qb.andWhere('a.workspace_id = :workspaceId', { workspaceId });
    const rows = await qb.getMany();
    const readable: Asset[] = [];
    for (const a of rows) {
      try {
        await this.assertReadable(userId, a);
        readable.push(a);
      } catch {
        /* silently skip unauthorized */
      }
    }
    return readable;
  }

  /** Resolve a complete reference set without leaking which id was missing or unreadable. */
  async getReadableInWorkspaceOrThrow(userId: string, ids: string[], workspaceId: string): Promise<Asset[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const rows = await this.listReadable(userId, unique, workspaceId);
    if (rows.length !== unique.length) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'one or more referenced assets were not found' });
    }
    const byId = new Map(rows.map((row) => [row.id, row]));
    return unique.map((id) => byId.get(id)!);
  }

  /**
   * Copy a workspace-scoped asset into a specific project. Records share the
   * underlying object-storage object; only metadata is duplicated.
   */
  async copyToProject(userId: string, workspaceId: string, assetId: string, projectId: string): Promise<Asset> {
    const a = await this.getOrThrow(userId, assetId, workspaceId);
    if (a.project_id === projectId) return a;
    // Defense in depth (the guard already checked project.asset.create on the
    // target): the target project must exist and live in the asset's workspace.
    const target = await this.projects.findOne({ where: { id: projectId } });
    if (!target || target.workspace_id !== a.workspace_id) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: '目标项目不在同一工作区' });
    }
    const copy = this.assets.create({
      ...a,
      id: undefined as never,
      upload_draft_id: null,
      task_id: null,
      project_id: projectId,
      scope: 'project',
      visibility: 'project',
      created_at: undefined as never,
    });
    return this.assets.save(copy);
  }

  /**
   * Mint a PUT URL so the client can attach a JPEG poster to an existing asset
   * (e.g. generation outputs that landed without thumb_storage_key).
   */
  async createThumbnailIntent(
    userId: string,
    workspaceId: string,
    id: string,
  ): Promise<{ thumb_upload_url: string; expires_in: number }> {
    const a = await this.getOrThrow(userId, id, workspaceId);
    await this.assertThumbWritable(userId, a);
    if (a.type !== 'video' && a.type !== 'image') {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'thumbnail only for image/video' });
    }
    const thumbKey = `${a.storage_key}.thumb.jpg`;
    return {
      thumb_upload_url: await this.urls.putObject(thumbKey, THUMB_PUT_TTL_SEC, 'image/jpeg'),
      expires_in: THUMB_PUT_TTL_SEC,
    };
  }

  /** After client PUT, HEAD the thumb object and persist thumb_storage_key. */
  async completeThumbnail(userId: string, workspaceId: string, id: string): Promise<Asset> {
    const a = await this.getOrThrow(userId, id, workspaceId);
    await this.assertThumbWritable(userId, a);
    const thumbKey = `${a.storage_key}.thumb.jpg`;
    const head = await this.urls.headObject(thumbKey);
    if (!head) {
      throw new BadRequestException({ code: 'UPLOAD_NOT_FOUND', message: 'thumbnail not uploaded yet' });
    }
    a.thumb_storage_key = thumbKey;
    return this.assets.save(a);
  }

  /** Owner or workspace super/owner may attach a client-generated poster. */
  private async assertThumbWritable(userId: string, a: Asset): Promise<void> {
    if (a.owner_id === userId) return;
    if (await this.authz.isSuperOrOwner(userId)) return;
    throw new ForbiddenException({ code: 'FORBIDDEN', message: 'cannot attach thumbnail' });
  }

  /** Owner-only (has_condition on project.asset.delete); project assets also
   *  require the delete capability on that project. */
  async softDelete(userId: string, workspaceId: string, id: string): Promise<void> {
    const a = await this.assets.findOne({ where: { id } });
    if (!a || a.deleted_at || a.workspace_id !== workspaceId) return;
    const isSuper = await this.authz.isSuperOrOwner(userId);
    if (a.owner_id !== userId && !isSuper) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'cannot delete asset' });
    }
    if (a.project_id && !isSuper) {
      const ok = await this.authz.can(userId, 'project.asset.delete', 'project', a.project_id);
      if (!ok) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'cannot delete asset' });
    }
    a.deleted_at = new Date();
    await this.assets.save(a);
  }
}
