import { api } from './client';

export interface CanvasMeta {
  id: string;
  project_id: string;
  name: string;
  viewport: { x: number; y: number; zoom: number };
  version: number;
  updated_at: string;
}

export interface ServerNode {
  id: string;
  canvas_id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  layout_zones: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ServerEdge {
  id: string;
  canvas_id: string;
  source_node_id: string;
  source_handle: string;
  target_node_id: string;
  target_handle: string;
  data_type: string;
  created_at: string;
}

export interface CanvasFullPayload {
  canvas: CanvasMeta;
  nodes: ServerNode[];
  edges: ServerEdge[];
}

export const canvasApi = {
  full: (projectId: string) => api<CanvasFullPayload>(`/projects/${projectId}/canvas`),
  updateViewport: (projectId: string, viewport: CanvasMeta['viewport'], ifMatch?: number) =>
    api<CanvasMeta>(`/projects/${projectId}/canvas`, {
      method: 'PATCH',
      body: { viewport, if_match_version: ifMatch },
    }),
  createNode: (projectId: string, body: Pick<ServerNode, 'type' | 'position' | 'data'>) =>
    api<ServerNode>(`/projects/${projectId}/canvas/nodes`, { method: 'POST', body }),
  /** Full-canvas replace (server-as-truth reconcile, e.g. after undo/redo). */
  replaceCanvas: (
    projectId: string,
    body: {
      nodes: Array<{
        id: string;
        type: string;
        position: { x: number; y: number };
        data?: Record<string, unknown>;
      }>;
      edges: Array<{
        id: string;
        source_node_id: string;
        source_handle: string;
        target_node_id: string;
        target_handle: string;
        data_type: string;
      }>;
      viewport?: { x: number; y: number; zoom: number };
    },
  ) => api<{ version: number }>(`/projects/${projectId}/canvas/replace`, { method: 'PUT', body }),
  updateNode: (projectId: string, nodeId: string, body: Partial<Pick<ServerNode, 'position' | 'data' | 'layout_zones'>>) =>
    api<ServerNode>(`/projects/${projectId}/canvas/nodes/${nodeId}`, { method: 'PATCH', body }),
  removeNode: (projectId: string, nodeId: string) =>
    api<void>(`/projects/${projectId}/canvas/nodes/${nodeId}`, { method: 'DELETE' }),
  createEdge: (projectId: string, body: Omit<ServerEdge, 'id' | 'canvas_id' | 'created_at'>) =>
    api<ServerEdge>(`/projects/${projectId}/canvas/edges`, { method: 'POST', body }),
  removeEdge: (projectId: string, edgeId: string) =>
    api<void>(`/projects/${projectId}/canvas/edges/${edgeId}`, { method: 'DELETE' }),
  createSnapshot: (projectId: string) =>
    api(`/projects/${projectId}/canvas/snapshots`, { method: 'POST' }),
  listSnapshots: (projectId: string) =>
    api<Array<{ id: string; version: number; created_at: string }>>(`/projects/${projectId}/canvas/snapshots`),
  restoreSnapshot: (projectId: string, snapshotId: string) =>
    api<{ version: number }>(`/projects/${projectId}/canvas/snapshots/${snapshotId}/restore`, { method: 'POST' }),
};
