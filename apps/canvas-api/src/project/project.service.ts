import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Asset, Project } from '../database/entities';
import { WorkspaceService } from '../workspace/workspace.service';
import type { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';

export interface ProjectListItem {
  id: string;
  name: string;
  cover_url: string | null;
  description: string | null;
  is_favorite: boolean;
  archived: boolean;
  asset_count: number;
  node_count: number;
  member_count: number;
  updated_at: Date;
}

@Injectable()
export class ProjectService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Asset) private readonly assets: Repository<Asset>,
    private readonly workspaces: WorkspaceService,
  ) {}

  async list(userId: string, workspaceId: string): Promise<ProjectListItem[]> {
    await this.workspaces.assertMember(userId, workspaceId);
    const rows = await this.projects.find({
      where: { workspace_id: workspaceId, archived: false },
      order: { is_favorite: 'DESC', updated_at: 'DESC' },
    });
    if (rows.length === 0) return [];

    const counts = await this.assets
      .createQueryBuilder('a')
      .select('a.project_id', 'pid')
      .addSelect('COUNT(*)', 'cnt')
      .where('a.project_id IN (:...ids)', { ids: rows.map((r) => r.id) })
      .andWhere('a.deleted_at IS NULL')
      .groupBy('a.project_id')
      .getRawMany<{ pid: string; cnt: string }>();
    const countByPid = new Map(counts.map((c) => [c.pid, Number(c.cnt)]));

    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      cover_url: p.cover_url,
      description: p.description,
      is_favorite: p.is_favorite,
      archived: p.archived,
      asset_count: countByPid.get(p.id) ?? 0,
      node_count: 0, // M3 wires this in
      member_count: 1, // M5 multi-member; for now creator only
      updated_at: p.updated_at,
    }));
  }

  async create(userId: string, dto: CreateProjectDto): Promise<Project> {
    await this.workspaces.assertMember(userId, dto.workspace_id);
    const p = this.projects.create({
      workspace_id: dto.workspace_id,
      name: dto.name,
      description: dto.description ?? null,
      cover_url: dto.cover_url ?? null,
      created_by: userId,
    });
    const saved = await this.projects.save(p);
    // The creator becomes the project's admin (RBAC: runtime projects, not only
    // the boot-time backfill). No cache to invalidate — the project is brand new.
    await this.projects.manager.query(
      `INSERT INTO canvas.role_bindings (user_id, role_id, scope_kind, scope_id, granted_by)
       SELECT $1, id, 'project', $2, $1 FROM canvas.roles WHERE key = 'project_admin'
       ON CONFLICT DO NOTHING`,
      [userId, saved.id],
    );
    return saved;
  }

  async getOrThrow(userId: string, projectId: string): Promise<Project> {
    const p = await this.projects.findOne({ where: { id: projectId } });
    if (!p) throw new NotFoundException({ code: 'NOT_FOUND', message: 'project not found' });
    await this.workspaces.assertMember(userId, p.workspace_id);
    return p;
  }

  async update(userId: string, projectId: string, dto: UpdateProjectDto): Promise<Project> {
    const p = await this.getOrThrow(userId, projectId);
    Object.assign(p, dto);
    return this.projects.save(p);
  }

  async remove(userId: string, projectId: string): Promise<void> {
    const p = await this.getOrThrow(userId, projectId);
    await this.projects.remove(p);
  }
}
