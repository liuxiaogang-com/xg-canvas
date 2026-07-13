import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Canvas, CanvasEdge, CanvasNode, CanvasSnapshot } from '../database/entities';
import { CanvasService } from './canvas.service';

@Injectable()
export class SnapshotService {
  constructor(
    @InjectRepository(CanvasSnapshot) private readonly snapshots: Repository<CanvasSnapshot>,
    @InjectRepository(Canvas) private readonly canvases: Repository<Canvas>,
    @InjectRepository(CanvasNode) private readonly nodes: Repository<CanvasNode>,
    @InjectRepository(CanvasEdge) private readonly edges: Repository<CanvasEdge>,
    private readonly canvasSvc: CanvasService,
  ) {}

  async list(userId: string, canvasId: string, limit = 30): Promise<CanvasSnapshot[]> {
    await this.canvasSvc.getOrThrow(userId, canvasId);
    return this.snapshots.find({
      where: { canvas_id: canvasId },
      order: { version: 'DESC' },
      take: Math.min(limit, 100),
    });
  }

  async create(userId: string, canvasId: string): Promise<CanvasSnapshot> {
    const c = await this.canvasSvc.getOrThrow(userId, canvasId);
    // If this version was already snapshotted (e.g. periodic auto-snapshot before
    // any edit bumped the version), return the existing row instead of violating
    // the (canvas_id, version) unique constraint.
    const existing = await this.snapshots.findOne({
      where: { canvas_id: canvasId, version: c.version },
    });
    if (existing) return existing;

    const [nodes, edges] = await Promise.all([
      this.nodes.find({ where: { canvas_id: canvasId } }),
      this.edges.find({ where: { canvas_id: canvasId } }),
    ]);
    const snap = this.snapshots.create({
      canvas_id: canvasId,
      version: c.version,
      payload: { nodes, edges, viewport: c.viewport },
    });
    return this.snapshots.save(snap);
  }

  async restore(userId: string, canvasId: string, snapshotId: string): Promise<{ version: number }> {
    const snap = await this.snapshots.findOne({ where: { id: snapshotId, canvas_id: canvasId } });
    if (!snap) throw new NotFoundException({ code: 'NOT_FOUND', message: 'snapshot not found' });
    await this.canvasSvc.getOrThrow(userId, canvasId);
    const payload = snap.payload as {
      nodes: CanvasNode[];
      edges: CanvasEdge[];
      viewport: Canvas['viewport'];
    };
    await this.nodes.delete({ canvas_id: canvasId });
    await this.edges.delete({ canvas_id: canvasId });
    if (payload.nodes.length > 0) {
      await this.nodes.save(payload.nodes.map((n) => this.nodes.create({ ...n, canvas_id: canvasId })));
    }
    if (payload.edges.length > 0) {
      await this.edges.save(payload.edges.map((e) => this.edges.create({ ...e, canvas_id: canvasId })));
    }
    await this.canvases.update(canvasId, { viewport: payload.viewport });
    const version = await this.canvasSvc.bumpVersion(canvasId, userId);
    return { version };
  }
}
