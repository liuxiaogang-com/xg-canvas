import { ConflictException } from '@nestjs/common';
import {
  ENTITY_REF_KINDS,
  IO_TYPES,
  isConnectionAllowed,
  parseEdgeDataType,
  type EdgeDataType,
  type IOType,
  type EntityRefKind,
  type PortRef,
} from '@xgcanvas/shared-types';

import type { CanvasNode } from '../database/entities';
import { getNodeSpec } from './node-spec';

export interface ProposedEdge {
  source_node_id: string;
  source_handle: string;
  target_node_id: string;
  target_handle: string;
  data_type: EdgeDataType;
}

/**
 * Validate an edge against the connection-rules table + each node's port spec.
 * Throws a 409 ConflictException with a clear reason on rejection.
 */
export function validateEdge(edge: ProposedEdge, nodes: CanvasNode[]): void {
  const src = nodes.find((n) => n.id === edge.source_node_id);
  const tgt = nodes.find((n) => n.id === edge.target_node_id);
  if (!src || !tgt) {
    throw new ConflictException({ code: 'NOT_FOUND', message: 'edge endpoints must reference nodes on the same canvas' });
  }

  const parsed = parseEdgeDataType(edge.data_type);
  if (!parsed) {
    throw new ConflictException({ code: 'VALIDATION_FAILED', message: `unknown data_type: ${edge.data_type}` });
  }

  const srcSpec = getNodeSpec(src.type);
  const tgtSpec = getNodeSpec(tgt.type);
  // The canvas-web single-port model collapses every node to one 'out'/'in'
  // handle, with the real type carried by data_type (which reflects the SOURCE
  // output type). Resolve the source port by handle id first, then by type.
  // For the target, resolve by handle id, then find ANY input compatible with
  // the source via the connection-rules table — the target may accept a
  // different but compatible type (e.g. image → image_list, grid → image).
  const matchKind = (p: { entityKind?: string }) => !parsed.entityKind || p.entityKind === parsed.entityKind;
  const srcPort =
    srcSpec.outputs.find((p) => p.id === edge.source_handle) ??
    srcSpec.outputs.find((p) => p.type === parsed.io && matchKind(p)) ??
    srcSpec.outputs.find((p) => p.type === parsed.io);
  if (!srcPort) {
    throw new ConflictException({ code: 'VALIDATION_FAILED', message: `no output of type ${parsed.io} on ${src.type}` });
  }

  // data_type must match the source port — it encodes the output type of the source node.
  if (srcPort.type !== parsed.io) {
    throw new ConflictException({
      code: 'VALIDATION_FAILED',
      message: `data_type ${edge.data_type} disagrees with source port type ${srcPort.type}`,
    });
  }

  // Find a compatible target port: first by handle id, then by connection-rules
  // compatibility with the resolved source port.
  const srcRef: PortRef = { io: srcPort.type, entityKind: srcPort.entityKind };
  const tgtPort =
    tgtSpec.inputs.find((p) => p.id === edge.target_handle) ??
    tgtSpec.inputs.find((p) =>
      isConnectionAllowed(srcRef, { io: p.type, entityKind: p.entityKind }),
    );
  if (!tgtPort) {
    throw new ConflictException({
      code: 'VALIDATION_FAILED',
      message: `no compatible input on ${tgt.type} for source type ${srcPort.type}`,
    });
  }

  const tgtRef: PortRef = { io: tgtPort.type, entityKind: tgtPort.entityKind };
  if (!isConnectionAllowed(srcRef, tgtRef)) {
    throw new ConflictException({
      code: 'VALIDATION_FAILED',
      message: `connection ${srcRef.io} -> ${tgtRef.io} is not allowed`,
    });
  }

  if (parsed.io === 'entity_ref') {
    const kind = parsed.entityKind;
    if (!kind || !(ENTITY_REF_KINDS as readonly string[]).includes(kind)) {
      throw new ConflictException({ code: 'VALIDATION_FAILED', message: `entity_ref must specify a known kind` });
    }
    if (srcPort.entityKind && srcPort.entityKind !== kind) {
      throw new ConflictException({ code: 'VALIDATION_FAILED', message: `source port expects entity_ref:${srcPort.entityKind}` });
    }
    if (tgtPort.entityKind && tgtPort.entityKind !== kind) {
      throw new ConflictException({ code: 'VALIDATION_FAILED', message: `target port expects entity_ref:${tgtPort.entityKind}` });
    }
  }
}

/**
 * Reject an edge that would make the dependency graph cyclic (A->B->C->A).
 * A new source->target edge closes a cycle iff `source` is already reachable
 * *from* `target` via the existing edges. Self-loops are an immediate cycle.
 */
export function assertNoCycle(
  existing: { source_node_id: string; target_node_id: string }[],
  sourceId: string,
  targetId: string,
): void {
  if (sourceId === targetId) {
    throw new ConflictException({ code: 'CYCLE', message: '不能把节点连到自己' });
  }
  const adj = new Map<string, string[]>();
  for (const e of existing) {
    const list = adj.get(e.source_node_id);
    if (list) list.push(e.target_node_id);
    else adj.set(e.source_node_id, [e.target_node_id]);
  }
  const stack = [targetId];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === sourceId) {
      throw new ConflictException({ code: 'CYCLE', message: '不能创建环路连线（会形成循环依赖）' });
    }
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of adj.get(cur) ?? []) stack.push(next);
  }
}

export type { IOType, EntityRefKind };
export const KNOWN_IO_TYPES: readonly string[] = IO_TYPES;
