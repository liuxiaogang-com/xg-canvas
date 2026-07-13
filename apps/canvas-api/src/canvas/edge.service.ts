import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CanvasEdge } from '../database/entities';
import { CanvasService } from './canvas.service';
import { NodeService } from './node.service';
import { assertNoCycle, validateEdge } from './connection-validator';
import type { CreateEdgeDto } from './dto/canvas.dto';

@Injectable()
export class EdgeService {
  constructor(
    @InjectRepository(CanvasEdge) private readonly edges: Repository<CanvasEdge>,
    private readonly canvases: CanvasService,
    private readonly nodes: NodeService,
  ) {}

  async create(userId: string, canvasId: string, dto: CreateEdgeDto): Promise<CanvasEdge> {
    await this.canvases.getOrThrow(userId, canvasId);
    const nodes = await this.nodes.findByCanvas(canvasId);
    validateEdge(
      {
        source_node_id: dto.source_node_id,
        source_handle: dto.source_handle,
        target_node_id: dto.target_node_id,
        target_handle: dto.target_handle,
        data_type: dto.data_type as never,
      },
      nodes,
    );
    // Reject a duplicate connection between the same endpoints (also DB-enforced
    // by uk_edge_endpoints) so the canvas can't accumulate stacked edges.
    const dup = await this.edges.findOne({
      where: {
        canvas_id: canvasId,
        source_node_id: dto.source_node_id,
        source_handle: dto.source_handle,
        target_node_id: dto.target_node_id,
        target_handle: dto.target_handle,
      },
    });
    if (dup) throw new ConflictException({ code: 'EDGE_EXISTS', message: '已存在相同的连线' });
    // Reject edges that would make the dependency graph cyclic.
    const existing = await this.edges.find({
      where: { canvas_id: canvasId },
      select: { source_node_id: true, target_node_id: true },
    });
    assertNoCycle(existing, dto.source_node_id, dto.target_node_id);
    const e = this.edges.create({ ...dto, canvas_id: canvasId });
    const saved = await this.edges.save(e);
    await this.canvases.bumpVersion(canvasId, userId);
    return saved;
  }

  async remove(userId: string, canvasId: string, edgeId: string): Promise<void> {
    await this.canvases.getOrThrow(userId, canvasId);
    const e = await this.edges.findOne({ where: { id: edgeId, canvas_id: canvasId } });
    if (!e) throw new NotFoundException({ code: 'NOT_FOUND', message: 'edge not found' });
    await this.edges.remove(e);
    await this.canvases.bumpVersion(canvasId, userId);
  }
}
