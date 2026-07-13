import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { CanvasNode } from '../database/entities';
import { CanvasService } from './canvas.service';
import type { CreateNodeDto, UpdateNodeDto } from './dto/canvas.dto';

@Injectable()
export class NodeService {
  constructor(
    @InjectRepository(CanvasNode) private readonly nodes: Repository<CanvasNode>,
    private readonly canvases: CanvasService,
  ) {}

  async create(userId: string, canvasId: string, dto: CreateNodeDto): Promise<CanvasNode> {
    await this.canvases.getOrThrow(userId, canvasId);
    const node = this.nodes.create({
      canvas_id: canvasId,
      type: dto.type,
      position: dto.position,
      data: dto.data ?? {},
      layout_zones: dto.layout_zones ?? {},
    });
    const saved = await this.nodes.save(node);
    await this.canvases.bumpVersion(canvasId, userId);
    return saved;
  }

  async update(userId: string, canvasId: string, nodeId: string, dto: UpdateNodeDto): Promise<CanvasNode> {
    await this.canvases.getOrThrow(userId, canvasId);
    const n = await this.nodes.findOne({ where: { id: nodeId, canvas_id: canvasId } });
    if (!n) throw new NotFoundException({ code: 'NOT_FOUND', message: 'node not found' });
    if (dto.position) n.position = dto.position;
    if (dto.data) n.data = { ...n.data, ...dto.data };
    if (dto.layout_zones) n.layout_zones = dto.layout_zones;
    const saved = await this.nodes.save(n);
    await this.canvases.bumpVersion(canvasId, userId);
    return saved;
  }

  async batchUpdate(
    userId: string,
    canvasId: string,
    patches: Array<{ id: string; position?: CanvasNode['position']; data?: CanvasNode['data']; layout_zones?: CanvasNode['layout_zones'] }>,
  ): Promise<CanvasNode[]> {
    await this.canvases.getOrThrow(userId, canvasId);
    if (patches.length === 0) return [];
    const ids = patches.map((p) => p.id);
    const rows = await this.nodes.find({ where: { id: In(ids), canvas_id: canvasId } });
    const byId = new Map(rows.map((n) => [n.id, n]));
    for (const p of patches) {
      const n = byId.get(p.id);
      if (!n) continue;
      if (p.position) n.position = p.position;
      if (p.data) n.data = { ...n.data, ...p.data };
      if (p.layout_zones) n.layout_zones = p.layout_zones;
    }
    const saved = await this.nodes.save(Array.from(byId.values()));
    await this.canvases.bumpVersion(canvasId, userId);
    return saved;
  }

  async remove(userId: string, canvasId: string, nodeId: string): Promise<void> {
    await this.canvases.getOrThrow(userId, canvasId);
    const n = await this.nodes.findOne({ where: { id: nodeId, canvas_id: canvasId } });
    if (!n) return;
    await this.nodes.remove(n);
    await this.canvases.bumpVersion(canvasId, userId);
  }

  async findByCanvas(canvasId: string): Promise<CanvasNode[]> {
    return this.nodes.find({ where: { canvas_id: canvasId } });
  }
}
