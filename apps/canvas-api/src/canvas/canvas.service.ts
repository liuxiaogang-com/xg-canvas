import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';

import { Canvas, CanvasEdge, CanvasNode } from '../database/entities';
import { ProjectService } from '../project/project.service';
import type { ReplaceCanvasDto, UpdateCanvasDto } from './dto/canvas.dto';

@Injectable()
export class CanvasService {
  constructor(
    @InjectRepository(Canvas) private readonly canvases: Repository<Canvas>,
    @InjectRepository(CanvasNode) private readonly nodes: Repository<CanvasNode>,
    @InjectRepository(CanvasEdge) private readonly edges: Repository<CanvasEdge>,
    private readonly projects: ProjectService,
    private readonly ds: DataSource,
  ) {}

  /** Lazily creates the canvas row on first access. Project ↔ canvas is 1:1. */
  async getOrCreate(userId: string, projectId: string): Promise<Canvas> {
    await this.projects.getOrThrow(userId, projectId);
    const existing = await this.canvases.findOne({ where: { project_id: projectId } });
    if (existing) return existing;
    const created = this.canvases.create({ project_id: projectId, last_modified_by: userId });
    return this.canvases.save(created);
  }

  async fullPayload(userId: string, projectId: string) {
    const c = await this.getOrCreate(userId, projectId);
    const [nodes, edges] = await Promise.all([
      this.nodes.find({ where: { canvas_id: c.id } }),
      this.edges.find({ where: { canvas_id: c.id } }),
    ]);
    return { canvas: c, nodes, edges };
  }

  async getOrThrow(userId: string, canvasId: string): Promise<Canvas> {
    const c = await this.canvases.findOne({ where: { id: canvasId } });
    if (!c) throw new NotFoundException({ code: 'NOT_FOUND', message: 'canvas not found' });
    await this.projects.getOrThrow(userId, c.project_id);
    return c;
  }

  async update(userId: string, canvasId: string, dto: UpdateCanvasDto): Promise<Canvas> {
    const c = await this.getOrThrow(userId, canvasId);
    if (typeof dto.if_match_version === 'number' && dto.if_match_version !== c.version) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: `version mismatch: server=${c.version}, client=${dto.if_match_version}`,
      });
    }
    if (dto.viewport) c.viewport = dto.viewport;
    if (dto.name) c.name = dto.name;
    c.last_modified_by = userId;
    return this.canvases.save(c);
  }

  /** Bumped on any structural change. Single source of truth for the client. */
  async bumpVersion(canvasId: string, userId: string): Promise<number> {
    const r = await this.canvases.query(
      `UPDATE canvas.canvases
         SET version = version + 1, last_modified_by = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING version`,
      [userId, canvasId],
    );
    return r?.[0]?.version ?? 0;
  }

  /**
   * Replace the entire canvas with the client's authoritative state: upsert
   * every node/edge by (client-owned) id, then prune anything not present —
   * all in one transaction. This lets the client reconcile after undo/redo
   * without orphaning rows on the server. Order matters: upsert nodes, prune
   * stale nodes (cascade-drops their edges), upsert edges, prune stale edges.
   */
  async replace(userId: string, canvasId: string, dto: ReplaceCanvasDto): Promise<{ version: number }> {
    await this.getOrThrow(userId, canvasId);
    const version = await this.ds.transaction(async (em) => {
      const nodeIds = dto.nodes.map((n) => n.id);

      for (const n of dto.nodes) {
        await em.upsert(
          CanvasNode,
          {
            id: n.id,
            canvas_id: canvasId,
            type: n.type,
            position: n.position,
            // jsonb columns: TypeORM's upsert deep-partial typing rejects a plain
            // Record here, so cast past it (the runtime value is a valid object).
            data: (n.data ?? {}) as never,
            layout_zones: (n.layout_zones ?? {}) as never,
          },
          ['id'],
        );
      }
      await em.delete(
        CanvasNode,
        nodeIds.length ? { canvas_id: canvasId, id: Not(In(nodeIds)) } : { canvas_id: canvasId },
      );

      // Keep only edges whose endpoints exist in the new node set (else the FK
      // upsert would abort the whole reconcile), and drop endpoint duplicates
      // (which would hit uk_edge_endpoints). The client owns this canvas, so we
      // trust the surviving edges' types rather than re-running validateEdge here.
      const nodeIdSet = new Set(nodeIds);
      const seenEndpoints = new Set<string>();
      const validEdges = dto.edges.filter((e) => {
        if (!nodeIdSet.has(e.source_node_id) || !nodeIdSet.has(e.target_node_id)) return false;
        const k = `${e.source_node_id}|${e.source_handle}|${e.target_node_id}|${e.target_handle}`;
        if (seenEndpoints.has(k)) return false;
        seenEndpoints.add(k);
        return true;
      });
      const keptEdgeIds = validEdges.map((e) => e.id);
      for (const e of validEdges) {
        await em.upsert(
          CanvasEdge,
          {
            id: e.id,
            canvas_id: canvasId,
            source_node_id: e.source_node_id,
            source_handle: e.source_handle,
            target_node_id: e.target_node_id,
            target_handle: e.target_handle,
            data_type: e.data_type,
          },
          ['id'],
        );
      }
      await em.delete(
        CanvasEdge,
        keptEdgeIds.length ? { canvas_id: canvasId, id: Not(In(keptEdgeIds)) } : { canvas_id: canvasId },
      );

      if (dto.viewport) await em.update(Canvas, { id: canvasId }, { viewport: dto.viewport });
      const r = await em.query(
        `UPDATE canvas.canvases SET version = version + 1, last_modified_by = $1, updated_at = NOW() WHERE id = $2 RETURNING version`,
        [userId, canvasId],
      );
      return (r?.[0]?.version ?? 0) as number;
    });
    return { version };
  }
}
