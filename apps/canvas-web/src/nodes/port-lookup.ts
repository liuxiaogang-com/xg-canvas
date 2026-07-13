import type { Node } from '@xyflow/react';

import { getSchema } from './registry';
import type { CanvasNodeData } from './types';

export interface PortType {
  type: string;
  entityKind?: string;
}

/** The type produced by a node's single source handle (primary output). */
export function outputTypeOf(node: Node<CanvasNodeData>): PortType | null {
  // asset_input carries a dynamic media type on node data after upload.
  if (node.type === 'asset_input') {
    const media = node.data?.media_type;
    if (media === 'image' || media === 'video' || media === 'audio') {
      return { type: media };
    }
    // Empty / uploading: fall back to image so palette + connect-menu stay usable.
    return { type: 'image' };
  }
  const out = getSchema(node.type ?? '')?.outputs?.[0];
  return out ? { type: out.type, entityKind: out.entityKind } : null;
}

/** Every input type a node's single target handle can accept. */
export function acceptedInputsOf(node: Node<CanvasNodeData>): PortType[] {
  return (getSchema(node.type ?? '')?.inputs ?? []).map((p) => ({ type: p.type, entityKind: p.entityKind }));
}
