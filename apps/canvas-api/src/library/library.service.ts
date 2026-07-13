import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import { AuthzService } from '../authz/authz.service';
import { AssetService } from '../asset/asset.service';
import { LibraryEntry, Project } from '../database/entities';
import { WorkspaceService } from '../workspace/workspace.service';
import type { CreateLibraryEntryDto, UpdateLibraryEntryDto } from './library.dto';

export interface LibraryListQuery {
  workspace_id: string;
  kind?: string;
  project_id?: string | 'global';
  q?: string;
  tags?: string[];
  favorited?: boolean;
  limit?: number;
  before?: string;
}

/** Reusable-resource library. Same visibility model as assets:
 *  private -> owner; project -> project.library.view; workspace -> member. */
@Injectable()
export class LibraryService {
  constructor(
    @InjectRepository(LibraryEntry) private readonly entries: Repository<LibraryEntry>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    private readonly workspaces: WorkspaceService,
    private readonly authz: AuthzService,
    private readonly assets: AssetService,
  ) {}

  async list(userId: string, q: LibraryListQuery): Promise<LibraryEntry[]> {
    await this.workspaces.assertMember(userId, q.workspace_id);
    const qb = this.entries
      .createQueryBuilder('e')
      .where('e.workspace_id = :wid', { wid: q.workspace_id })
      .andWhere('e.deleted_at IS NULL')
      .orderBy('e.created_at', 'DESC')
      .limit(Math.min(q.limit ?? 60, 200));
    if (q.kind) qb.andWhere('e.kind = :kind', { kind: q.kind });
    if (q.project_id === 'global') qb.andWhere('e.project_id IS NULL');
    else if (q.project_id) qb.andWhere('e.project_id = :pid', { pid: q.project_id });
    if (q.q) qb.andWhere('e.name ILIKE :name', { name: `%${q.q}%` });
    if (q.tags?.length) qb.andWhere('e.tags && :tags', { tags: q.tags });
    if (q.before) qb.andWhere('e.created_at < :b', { b: q.before });
    if (q.favorited) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM canvas.favorites f
           WHERE f.user_id = :fuid AND f.target_type = 'library_entry' AND f.target_id = e.id)`,
        { fuid: userId },
      );
    }

    const viewable = await this.authz.projectIdsWithCap(userId, 'project.library.view');
    if (viewable !== 'ALL') {
      qb.andWhere(
        new Brackets((w) => {
          w.where('e.owner_id = :uid', { uid: userId }).orWhere("e.visibility = 'workspace'");
          if (viewable.length > 0) {
            w.orWhere("(e.visibility = 'project' AND e.project_id IN (:...vpids))", { vpids: viewable });
          }
        }),
      );
    } else {
      qb.andWhere("(e.visibility != 'private' OR e.owner_id = :uid)", { uid: userId });
    }
    return qb.getMany();
  }

  async getOrThrow(userId: string, id: string, workspaceId?: string): Promise<LibraryEntry> {
    const e = await this.entries.findOne({ where: { id } });
    if (!e || e.deleted_at || (workspaceId && e.workspace_id !== workspaceId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'library entry not found' });
    }
    await this.assertReadable(userId, e);
    return e;
  }

  async getInWorkspaceOrThrow(userId: string, id: string, workspaceId: string): Promise<LibraryEntry> {
    return this.getOrThrow(userId, id, workspaceId);
  }

  async assertReadable(userId: string, e: LibraryEntry): Promise<void> {
    if (e.visibility === 'project' && !e.project_id) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'library entry not found' });
    }
    if (e.owner_id === userId) return;
    if (e.visibility === 'private') {
      if (!(await this.authz.isSuperOrOwner(userId))) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'library entry not found' });
      }
      return;
    }
    if (e.visibility === 'project') {
      const ok = await this.authz.can(userId, 'project.library.view', 'project', e.project_id);
      if (!ok) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'no access to library entry' });
      return;
    }
    await this.workspaces.assertMember(userId, e.workspace_id);
  }

  async create(userId: string, workspaceId: string, dto: CreateLibraryEntryDto): Promise<LibraryEntry> {
    await this.workspaces.assertMember(userId, workspaceId);
    await this.assertProjectWrite(userId, workspaceId, dto.project_id);
    const visibility = dto.visibility ?? (dto.project_id ? 'project' : 'private');
    await this.assertVisibilityPolicy(userId, dto.project_id ?? null, visibility);
    const entry = this.entries.create({
      kind: dto.kind.trim(),
      scope: dto.project_id ? 'project' : 'workspace',
      visibility,
      workspace_id: workspaceId,
      project_id: dto.project_id ?? null,
      owner_id: userId,
      name: dto.name.trim(),
      description: dto.description ?? null,
      tags: normaliseTags(dto.tags),
      cover_asset_id: dto.cover_asset_id ?? null,
      material: dto.material ?? null,
      provider_refs: [],
    });
    await this.validateReferences(userId, entry);
    return this.entries.save(entry);
  }

  async update(userId: string, workspaceId: string, id: string, dto: UpdateLibraryEntryDto): Promise<LibraryEntry> {
    const e = await this.getOrThrow(userId, id, workspaceId);
    await this.assertEditable(userId, e);
    const next = this.entries.create({
      ...e,
      name: dto.name !== undefined ? dto.name.trim() : e.name,
      description: dto.description !== undefined ? dto.description : e.description,
      visibility: dto.visibility ?? e.visibility,
      tags: dto.tags !== undefined ? normaliseTags(dto.tags) : e.tags,
      cover_asset_id: dto.cover_asset_id !== undefined ? dto.cover_asset_id : e.cover_asset_id,
      material: dto.material !== undefined ? dto.material : e.material,
    });
    await this.assertVisibilityPolicy(userId, next.project_id, next.visibility);
    await this.validateReferences(userId, next);
    e.name = next.name;
    e.description = next.description;
    e.visibility = next.visibility;
    e.tags = next.tags;
    e.cover_asset_id = next.cover_asset_id;
    e.material = next.material;
    return this.entries.save(e);
  }

  async softDelete(userId: string, workspaceId: string, id: string): Promise<void> {
    const e = await this.entries.findOne({ where: { id } });
    if (!e || e.deleted_at || e.workspace_id !== workspaceId) return;
    await this.assertDeletePolicy(userId, e);
    e.deleted_at = new Date();
    await this.entries.save(e);
  }

  private async assertEditable(userId: string, e: LibraryEntry): Promise<void> {
    if (await this.authz.isSuperOrOwner(userId)) return;
    if (e.visibility === 'private' && e.owner_id !== userId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'cannot edit library entry' });
    }
    if (e.project_id) {
      if (await this.authz.can(userId, 'project.library.create', 'project', e.project_id)) return;
    } else if (e.owner_id === userId) {
      return;
    } else if (e.visibility === 'workspace'
      && await this.authz.can(userId, 'system.content.manage', 'system', null)) {
      return;
    }
    throw new ForbiddenException({ code: 'FORBIDDEN', message: 'cannot edit library entry' });
  }

  private async assertProjectWrite(userId: string, workspaceId: string, projectId?: string): Promise<void> {
    if (!projectId) return;
    const project = await this.projects.findOne({ where: { id: projectId } });
    if (!project || project.workspace_id !== workspaceId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: '目标项目不在当前工作区' });
    }
    if (!await this.authz.can(userId, 'project.library.create', 'project', projectId)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: '缺少项目资源库写入权限' });
    }
  }

  private async assertVisibilityPolicy(
    userId: string,
    projectId: string | null,
    visibility: LibraryEntry['visibility'],
  ): Promise<void> {
    if (visibility === 'project' && !projectId) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'project visibility requires project_id' });
    }
    if (visibility === 'workspace'
      && !await this.authz.can(userId, 'system.content.manage', 'system', null)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: '缺少工作区公共内容管理权限' });
    }
  }

  private async validateReferences(userId: string, entry: LibraryEntry): Promise<void> {
    const ids = [
      ...(entry.cover_asset_id ? [entry.cover_asset_id] : []),
      ...(entry.material?.asset_ids ?? []),
      ...entry.provider_refs.flatMap((ref) => ref.sample_asset_id ? [ref.sample_asset_id] : []),
    ];
    const assets = await this.assets.getReadableInWorkspaceOrThrow(userId, ids, entry.workspace_id);
    for (const asset of assets) {
      const compatible = entry.visibility === 'private'
        || asset.visibility === 'workspace'
        || (entry.visibility === 'project'
          && asset.visibility === 'project'
          && asset.project_id === entry.project_id);
      if (!compatible) {
        throw new BadRequestException({
          code: 'REFERENCE_VISIBILITY_MISMATCH',
          message: 'resource visibility is broader than one or more referenced assets',
        });
      }
    }
  }

  private async assertDeletePolicy(userId: string, entry: LibraryEntry): Promise<void> {
    if (await this.authz.isSuperOrOwner(userId)) return;
    if (entry.visibility === 'private' && entry.owner_id !== userId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'cannot delete library entry' });
    }
    if (entry.project_id) {
      if (await this.authz.can(userId, 'project.library.delete', 'project', entry.project_id)) return;
    } else if (entry.owner_id === userId) {
      return;
    } else if (entry.visibility === 'workspace'
      && await this.authz.can(userId, 'system.content.manage', 'system', null)) {
      return;
    }
    throw new ForbiddenException({ code: 'FORBIDDEN', message: 'cannot delete library entry' });
  }
}

function normaliseTags(tags?: string[]): string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
}
