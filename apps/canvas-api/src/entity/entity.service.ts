import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuthzService } from '../authz/authz.service';
import { AssetService } from '../asset/asset.service';
import { CanvasEntity, Favorite } from '../database/entities';
import { LibraryService } from '../library/library.service';
import { ProjectService } from '../project/project.service';
import type { CreateEntityDto, UpdateEntityDto } from './dto/entity.dto';

@Injectable()
export class EntityService {
  constructor(
    @InjectRepository(CanvasEntity) private readonly entities: Repository<CanvasEntity>,
    @InjectRepository(Favorite) private readonly favorites: Repository<Favorite>,
    private readonly projects: ProjectService,
    private readonly authz: AuthzService,
    private readonly assets: AssetService,
    private readonly library: LibraryService,
  ) {}

  // The @RequirePerm guard can't cover update/remove (the project lives on the
  // entity, not the request), so entity authz runs here uniformly.
  private async assertProjectPerm(userId: string, perm: string, projectId: string): Promise<void> {
    if (!(await this.authz.can(userId, perm, 'project', projectId))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: '权限不足', permission: perm });
    }
  }

  async list(userId: string, projectId: string, type?: CanvasEntity['type']): Promise<CanvasEntity[]> {
    await this.projects.getOrThrow(userId, projectId);
    await this.assertProjectPerm(userId, 'project.read', projectId);
    return this.entities.find({
      where: type ? { project_id: projectId, type } : { project_id: projectId },
      order: { created_at: 'ASC' },
    });
  }

  async create(userId: string, dto: CreateEntityDto): Promise<CanvasEntity> {
    const project = await this.projects.getOrThrow(userId, dto.project_id);
    await this.assertProjectPerm(userId, 'project.canvas.node.edit', dto.project_id);
    const entity = this.entities.create({
      project_id: dto.project_id,
      type: dto.type,
      name: dto.name.trim(),
      description: dto.description ?? null,
      ref_asset_ids: dto.ref_asset_ids ?? [],
      generated_asset_id: null,
      library_entry_id: null,
    });
    await this.validateReferences(userId, project.workspace_id, entity);
    return this.entities.save(entity);
  }

  async update(userId: string, id: string, dto: UpdateEntityDto): Promise<CanvasEntity> {
    const e = await this.entities.findOne({ where: { id } });
    if (!e) throw new NotFoundException({ code: 'NOT_FOUND', message: 'entity not found' });
    const project = await this.projects.getOrThrow(userId, e.project_id);
    await this.assertProjectPerm(userId, 'project.canvas.node.edit', e.project_id);
    const next = this.entities.create({
      ...e,
      name: dto.name !== undefined ? dto.name.trim() : e.name,
      description: dto.description !== undefined ? dto.description : e.description,
      ref_asset_ids: dto.ref_asset_ids ?? e.ref_asset_ids,
      generated_asset_id: dto.generated_asset_id !== undefined ? dto.generated_asset_id : e.generated_asset_id,
      library_entry_id: dto.library_entry_id !== undefined ? dto.library_entry_id : e.library_entry_id,
    });
    await this.validateReferences(userId, project.workspace_id, next);
    e.name = next.name;
    e.description = next.description;
    e.ref_asset_ids = next.ref_asset_ids;
    e.generated_asset_id = next.generated_asset_id;
    e.library_entry_id = next.library_entry_id;
    return this.entities.save(e);
  }

  async remove(userId: string, id: string): Promise<void> {
    const e = await this.entities.findOne({ where: { id } });
    if (!e) return;
    await this.projects.getOrThrow(userId, e.project_id);
    await this.assertProjectPerm(userId, 'project.canvas.node.edit', e.project_id);
    await this.favorites.delete({ target_type: 'entity', target_id: e.id });
    await this.entities.remove(e);
  }

  async getInWorkspaceOrThrow(userId: string, id: string, workspaceId: string): Promise<CanvasEntity> {
    const entity = await this.entities.findOne({ where: { id } });
    if (!entity) throw this.notFound();
    const project = await this.projects.getOrThrow(userId, entity.project_id);
    if (project.workspace_id !== workspaceId
      || !await this.authz.can(userId, 'project.read', 'project', entity.project_id)) {
      throw this.notFound();
    }
    return entity;
  }

  private async validateReferences(userId: string, workspaceId: string, entity: CanvasEntity): Promise<void> {
    const ids = [...entity.ref_asset_ids, ...(entity.generated_asset_id ? [entity.generated_asset_id] : [])];
    const assets = await this.assets.getReadableInWorkspaceOrThrow(userId, ids, workspaceId);
    if (assets.some((asset) => asset.visibility === 'private'
      || (asset.visibility === 'project' && asset.project_id !== entity.project_id))) {
      throw new ForbiddenException({ code: 'REFERENCE_VISIBILITY_MISMATCH', message: 'entity asset is not shareable in this project' });
    }
    if (entity.library_entry_id) {
      const entry = await this.library.getInWorkspaceOrThrow(userId, entity.library_entry_id, workspaceId);
      if (entry.visibility === 'private'
        || (entry.visibility === 'project' && entry.project_id !== entity.project_id)) {
        throw new ForbiddenException({ code: 'REFERENCE_VISIBILITY_MISMATCH', message: 'library entry is not shareable in this project' });
      }
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ code: 'NOT_FOUND', message: 'entity not found' });
  }
}
