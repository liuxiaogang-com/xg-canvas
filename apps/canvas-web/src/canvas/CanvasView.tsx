import { useCallback, useMemo } from 'react';
import {
  Controls,
  MiniMap,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { isConnectionAllowed } from '@xgcanvas/shared-types';

import { canvasApi } from '../api/canvas';
import { PlaybackRegistryProvider } from '../components/media-player';
import CanvasBackdrop from './CanvasBackdrop';
import { toast } from '../ui';
import type { CanvasNodeData } from '../nodes/types';
import { acceptedInputsOf, outputTypeOf } from '../nodes/port-lookup';
import { NODE_TYPE_COMPONENTS, getSchema } from '../nodes/registry';
import { useCanvasStore } from './canvas-state';
import { useCanvasUI } from './ui-state';
import { edgeColor } from './connect-helpers';
import ConnectMenu from './context-menu/ConnectMenu';
import { useCanvasBoardInteractions } from './hooks/useCanvasBoardInteractions';
import { useCanvasConnect } from './hooks/useCanvasConnect';
import { copySelected, duplicateSelected } from './clipboard-ops';
import { groupSelected, ungroupSelected } from './grouping';
import { useCanvasShortcuts, type ShortcutHandlers } from './shortcuts/useCanvasShortcuts';
import { scheduleNodeUpdate, scheduleViewport } from './sync/auto-save';
import { scheduleReconcile } from './sync/reconcile';
import { notifySyncError } from './sync/sync-error';
import './canvas-flow.css';

interface Props {
  projectId: string;
  onNodeClick?(nodeId: string): void;
  onNodeContextMenu?(nodeId: string, x: number, y: number): void;
  onPaneMenu?(x: number, y: number, flow: { x: number; y: number }): void;
  onOpenResources?(): void;
}

/** Render the React Flow board. Caller must wrap in <ReactFlowProvider> so siblings
 * (toolbars, panels) can read viewport state via @xyflow/react hooks. */
export default function CanvasView({
  projectId,
  onNodeClick,
  onNodeContextMenu,
  onPaneMenu,
  onOpenResources,
}: Props) {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const viewport = useCanvasStore((s) => s.viewport);
  const setNodes = useCanvasStore((s) => s.setNodes);
  const setEdges = useCanvasStore((s) => s.setEdges);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const setSelected = useCanvasStore((s) => s.setSelected);
  const { screenToFlowPosition } = useReactFlow();

  const { boardRef, pointerRef, onSurfaceDblClick, onBoardDragOver, onBoardDrop } =
    useCanvasBoardInteractions({ projectId, screenToFlowPosition, onPaneMenu });

  const createNodeAt = useCallback(
    async (type: string, screen?: { x: number; y: number }) => {
      const schema = getSchema(type);
      if (!schema) return;
      const position = screenToFlowPosition(screen ?? pointerRef.current);
      try {
        const created = await canvasApi.createNode(projectId, {
          type,
          position,
          data: schema.defaultData as never,
        });
        setNodes((prev) => [
          ...prev.map((n) => (n.selected ? { ...n, selected: false } : n)),
          {
            id: created.id,
            type: created.type,
            position: created.position,
            data: created.data as never,
            selected: true,
          },
        ]);
        setSelected(created.id);
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [projectId, screenToFlowPosition, setNodes, setSelected],
  );

  const deleteSelected = useCallback(() => {
    const st = useCanvasStore.getState();
    const nodeIds = new Set(
      st.nodes.filter((n) => n.selected || n.id === st.selectedNodeId).map((n) => n.id),
    );
    const edgeIds = new Set(st.edges.filter((e) => e.selected).map((e) => e.id));
    if (nodeIds.size === 0 && edgeIds.size === 0) return;
    setNodes((prev) => prev.filter((n) => !nodeIds.has(n.id)));
    setEdges((prev) =>
      prev.filter((e) => !edgeIds.has(e.id) && !nodeIds.has(e.source) && !nodeIds.has(e.target)),
    );
    setSelected(null);
    for (const id of nodeIds)
      canvasApi.removeNode(projectId, id).catch((e) => notifySyncError(e, 'delete node'));
    for (const id of edgeIds)
      canvasApi.removeEdge(projectId, id).catch((e) => notifySyncError(e, 'delete edge'));
  }, [projectId, setNodes, setEdges, setSelected]);

  const shortcutHandlers = useMemo<ShortcutHandlers>(
    () => ({
      'create.image': () => void createNodeAt('gen_image'),
      'create.video': () => void createNodeAt('gen_video'),
      // Hidden from palette until ready — keep handlers commented, do not delete.
      // 'create.text': () => void createNodeAt('gen_text'), // 文本生成链路未理顺
      // 'create.audio': () => void createNodeAt('gen_audio'), // 音频生成未收口
      // 'create.script': () => void createNodeAt('script_input'), // 脚本流水线未完成
      // undo/redo mutate the store directly (bypassing the per-node API), so
      // reconcile the whole canvas to the server afterwards — no orphan rows.
      'edit.undo': () => {
        useCanvasStore.temporal.getState().undo();
        scheduleReconcile(projectId);
      },
      'edit.redo': () => {
        useCanvasStore.temporal.getState().redo();
        scheduleReconcile(projectId);
      },
      'edit.copy': copySelected,
      // paste is handled by the board paste listener (files first, then nodes)
      'edit.duplicate': () => void duplicateSelected(projectId),
      'edit.delete': deleteSelected,
      'edit.group': () => void groupSelected(projectId),
      'edit.ungroup': () => void ungroupSelected(projectId),
      'view.save': () => {
        canvasApi
          .createSnapshot(projectId)
          .then(() => toast.success('已保存快照'))
          .catch((e) => toast.error((e as Error).message || '保存快照失败'));
      },
      'view.find': () => onOpenResources?.(),
    }),
    [projectId, onOpenResources, createNodeAt, deleteSelected],
  );
  useCanvasShortcuts(shortcutHandlers);

  // Color each edge by its data_type (typed-port coloring).
  const styledEdges = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        style: {
          stroke: edgeColor((e.data as { data_type?: string } | undefined)?.data_type),
          strokeWidth: 2,
          ...((e.style as object | undefined) ?? {}),
        },
      })),
    [edges],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<CanvasNodeData>>[]) => {
      // Track dragging so toolbars / panels can temporarily hide while the user
      // repositions a node, giving a clean view of the board.
      const isDragging = changes.some((c) => c.type === 'position' && c.dragging);
      useCanvasUI.getState().setDragging(!!isDragging);

      // Only a drag-END position change is worth an undo step; React Flow's
      // dimension/select/drag churn is paused so it doesn't pollute history.
      const recordable = changes.some((c) => c.type === 'position' && !c.dragging);
      const temporal = useCanvasStore.temporal.getState();
      if (!recordable) temporal.pause();
      setNodes((prev) => applyNodeChanges(changes, prev));
      if (!recordable) temporal.resume();
      let selectionChanged = false;
      for (const c of changes) {
        if (c.type === 'position' && c.position && !c.dragging) {
          scheduleNodeUpdate(projectId, c.id, { position: c.position });
        }
        if (c.type === 'remove') {
          canvasApi.removeNode(projectId, c.id).catch((e) => notifySyncError(e, 'delete node'));
        }
        if (c.type === 'select') selectionChanged = true;
      }
      // Inline form only for a single selected (non-group) node — multi-select
      // suppresses it.
      if (selectionChanged) {
        const sel = useCanvasStore.getState().nodes.filter((n) => n.selected && n.type !== 'group');
        setSelected(sel.length === 1 ? sel[0].id : null);
      }
    },
    [projectId, setNodes, setSelected],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      // edge selection churn is noise; real edge add/remove go via onConnect /
      // deleteSelected which record explicitly.
      const temporal = useCanvasStore.temporal.getState();
      temporal.pause();
      setEdges((prev) => applyEdgeChanges(changes, prev));
      temporal.resume();
      for (const c of changes) {
        if (c.type === 'remove')
          canvasApi.removeEdge(projectId, c.id).catch((e) => notifySyncError(e, 'delete edge'));
      }
    },
    [projectId, setEdges],
  );

  const isValidConnection = useCallback(
    (c: Connection | Edge) => {
      const src = nodes.find((n) => n.id === c.source);
      const tgt = nodes.find((n) => n.id === c.target);
      if (!src || !tgt || src.id === tgt.id) return false;
      const so = outputTypeOf(src);
      if (!so) return false;
      // single-port: source output must be accepted by ANY of the target's input types
      return acceptedInputsOf(tgt).some((ti) =>
        isConnectionAllowed(
          { io: so.type as never, entityKind: so.entityKind as never },
          { io: ti.type as never, entityKind: ti.entityKind as never },
        ),
      );
    },
    [nodes],
  );

  // Connecting: real connections persist; dropping on empty canvas opens a
  // compatible-node menu (create + connect).
  const { onConnect, onConnectEnd, connectMenu, setConnectMenu, createConnected } =
    useCanvasConnect(projectId);

  const nodeTypes = useMemo(() => NODE_TYPE_COMPONENTS, []);
  const selectMode = useCanvasUI((s) => s.pointerMode) === 'select';
  const canEdit = useCanvasUI((s) => s.canEdit);

  return (
    <PlaybackRegistryProvider>
      <div
        ref={boardRef}
        className="cv-board"
        onDoubleClick={onSurfaceDblClick}
        onDragOver={onBoardDragOver}
        onDrop={onBoardDrop}
      >
        <CanvasBackdrop />
        <ReactFlow
          nodes={nodes}
          edges={styledEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onNodeClick={(_evt, node) => {
            // selection (incl. multi) is derived in onNodesChange; just forward.
            onNodeClick?.(node.id);
          }}
          onNodeContextMenu={(e, node) => {
            e.preventDefault();
            setSelected(node.id);
            onNodeContextMenu?.(node.id, e.clientX, e.clientY);
          }}
          onPaneClick={() => setSelected(null)}
          nodesDraggable={canEdit}
          nodesConnectable={canEdit}
          zoomOnDoubleClick={false}
          panOnDrag={selectMode ? [1, 2] : true}
          selectionOnDrag={selectMode}
          panOnScroll={selectMode}
          zoomOnScroll={!selectMode}
          zoomActivationKeyCode={selectMode ? 'Alt' : null}
          deleteKeyCode={null}
          isValidConnection={isValidConnection}
          onMoveEnd={(_e, vp) => {
            setViewport(vp);
            scheduleViewport(projectId, vp);
          }}
          defaultViewport={viewport}
          nodeTypes={nodeTypes}
          fitView={false}
          proOptions={{ hideAttribution: true }}
        >
          <Controls position="bottom-left" />
          <MiniMap
            position="bottom-right"
            nodeColor={() => 'rgba(124,92,252,0.3)'}
            maskColor="rgba(14,16,20,0.6)"
            style={{
              background: 'var(--c-canvas-panel)',
              border: '1px solid var(--c-canvas-border-soft)',
            }}
          />
        </ReactFlow>
        <ConnectMenu
          menu={connectMenu}
          onClose={() => setConnectMenu(null)}
          onPick={createConnected}
        />
      </div>
    </PlaybackRegistryProvider>
  );
}
