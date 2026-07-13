import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { Canvas, CanvasEdge, CanvasNode } from '../database/entities';
import { validateEdge } from './connection-validator';

export type BatchOp =
  | { kind: 'create_node'; client_id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }
  | { kind: 'update_node'; node_id: string; position?: { x: number; y: number }; data?: Record<string, unknown> }
  | { kind: 'delete_node'; node_id: string }
  | {
      kind: 'create_edge';
      /** Either a real node uuid or a `client_id` from a prior create_node. */
      source_ref: string;
      source_handle: string;
      target_ref: string;
      target_handle: string;
      data_type: string;
    };

export interface BatchResult {
  created_node_ids: Record<string, string>; // client_id -> server uuid
  created_edge_ids: string[];
  deleted_node_ids: string[];
  updated_node_ids: string[];
}

/**
 * Atomic canvas mutator. Used by the script-extract pipeline so a single
 * "extract characters" step either creates ALL the nodes+edges or none.
 */
@Injectable()
export class CanvasMutatorService {
  constructor(
    @InjectRepository(Canvas) private readonly canvases: Repository<Canvas>,
    private readonly ds: DataSource,
  ) {}

  async apply(canvasId: string, ops: BatchOp[], userId: string): Promise<BatchResult> {
    return this.ds.transaction(async (em) => {
      const result: BatchResult = {
        created_node_ids: {},
        created_edge_ids: [],
        deleted_node_ids: [],
        updated_node_ids: [],
      };

      for (const op of ops) {
        if (op.kind === 'create_node') {
          const n = em.create(CanvasNode, {
            canvas_id: canvasId,
            type: op.type,
            position: op.position,
            data: op.data,
            layout_zones: {},
          });
          await em.save(n);
          result.created_node_ids[op.client_id] = n.id;
        } else if (op.kind === 'update_node') {
          const n = await em.findOne(CanvasNode, { where: { id: op.node_id, canvas_id: canvasId } });
          if (!n) continue;
          if (op.position) n.position = op.position;
          if (op.data) n.data = { ...n.data, ...op.data };
          await em.save(n);
          result.updated_node_ids.push(n.id);
        } else if (op.kind === 'delete_node') {
          await em.delete(CanvasNode, { id: op.node_id, canvas_id: canvasId });
          result.deleted_node_ids.push(op.node_id);
        } else if (op.kind === 'create_edge') {
          const sourceId = result.created_node_ids[op.source_ref] ?? op.source_ref;
          const targetId = result.created_node_ids[op.target_ref] ?? op.target_ref;
          const allNodes = await em.find(CanvasNode, {
            where: { canvas_id: canvasId, id: In([sourceId, targetId]) },
          });
          validateEdge(
            {
              source_node_id: sourceId,
              source_handle: op.source_handle,
              target_node_id: targetId,
              target_handle: op.target_handle,
              data_type: op.data_type as never,
            },
            allNodes,
          );
          const edge = em.create(CanvasEdge, {
            canvas_id: canvasId,
            source_node_id: sourceId,
            source_handle: op.source_handle,
            target_node_id: targetId,
            target_handle: op.target_handle,
            data_type: op.data_type,
          });
          await em.save(edge);
          result.created_edge_ids.push(edge.id);
        }
      }

      await em.query(
        `UPDATE canvas.canvases SET version = version + 1, last_modified_by = $1, updated_at = NOW() WHERE id = $2`,
        [userId, canvasId],
      );
      return result;
    });
  }
}
