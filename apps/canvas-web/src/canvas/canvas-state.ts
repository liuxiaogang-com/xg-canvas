import { create } from 'zustand';
import { temporal } from 'zundo';
import type { Edge, Node } from '@xyflow/react';

import type { CanvasNodeData } from '../nodes/types';
import type { CanvasFullPayload, ServerEdge, ServerNode } from '../api/canvas';

export interface CanvasState {
  projectId: string | null;
  canvasId: string | null;
  version: number;
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
  viewport: { x: number; y: number; zoom: number };
  selectedNodeId: string | null;
  loaded: boolean;

  hydrate(p: CanvasFullPayload): void;
  setSelected(id: string | null): void;
  setNodes(updater: (prev: Node<CanvasNodeData>[]) => Node<CanvasNodeData>[]): void;
  setEdges(updater: (prev: Edge[]) => Edge[]): void;
  setViewport(v: CanvasState['viewport']): void;
  patchNodeData(id: string, patch: Partial<CanvasNodeData>): void;
  bumpVersion(v: number): void;
}

export const useCanvasStore = create<CanvasState>()(
  temporal<CanvasState>(
    (set) => ({
      projectId: null,
      canvasId: null,
      version: 0,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      selectedNodeId: null,
      loaded: false,
      hydrate(p) {
        // React Flow requires parent (group) nodes before their children.
        const ordered = [...p.nodes].sort((a, b) => (a.type === 'group' ? 0 : 1) - (b.type === 'group' ? 0 : 1));
        set({
          projectId: p.canvas.project_id,
          canvasId: p.canvas.id,
          version: p.canvas.version,
          viewport: p.canvas.viewport,
          nodes: ordered.map(serverToFlowNode),
          edges: p.edges.map(serverToFlowEdge),
          loaded: true,
        });
      },
      setSelected(id) {
        set({ selectedNodeId: id });
      },
      setNodes(updater) {
        set((s) => ({ nodes: updater(s.nodes) }));
      },
      setEdges(updater) {
        set((s) => ({ edges: updater(s.edges) }));
      },
      setViewport(v) {
        set({ viewport: v });
      },
      patchNodeData(id, patch) {
        // data patches (polling status, inline edits) shouldn't create undo steps
        const t = useCanvasStore.temporal.getState();
        t.pause();
        set((s) => ({
          nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
        }));
        t.resume();
      },
      bumpVersion(v) {
        set({ version: v });
      },
    }),
    {
      // Undo only node/edge structure — not selection or viewport pan/zoom.
      partialize: (s) => ({ nodes: s.nodes, edges: s.edges }) as never,
      // Coalesce: skip history entries where nodes & edges are unchanged
      // (selection-only / viewport set() calls would otherwise pollute undo).
      equality: (a: { nodes: unknown; edges: unknown }, b: { nodes: unknown; edges: unknown }) =>
        a.nodes === b.nodes && a.edges === b.edges,
      limit: 50,
    },
  ),
);

function serverToFlowNode(n: ServerNode): Node<CanvasNodeData> {
  const data = n.data as CanvasNodeData & { parent_id?: string; width?: number; height?: number };
  const node: Node<CanvasNodeData> = { id: n.id, type: n.type, position: n.position, data };
  if (data.parent_id) node.parentId = data.parent_id;
  if (n.type === 'group') node.style = { width: data.width ?? 240, height: data.height ?? 160 };
  return node;
}

function serverToFlowEdge(e: ServerEdge): Edge {
  return {
    id: e.id,
    source: e.source_node_id,
    target: e.target_node_id,
    // Single-port model: every node exposes exactly one `out`/`in` handle, so
    // normalize here. Legacy/seeded edges still carry old typed handle ids
    // (output_text/prompt/reference_image/...) that no longer exist on the
    // nodes; binding them verbatim makes React Flow drop the edge (error 008).
    // The edge's role is carried by data_type, not the handle.
    sourceHandle: 'out',
    targetHandle: 'in',
    data: { data_type: e.data_type },
  };
}
