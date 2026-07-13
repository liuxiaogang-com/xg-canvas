import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';

import './CanvasPage.css';
import { canvasApi } from '../api/canvas';
import { projectApi } from '../api/project';
import { getSchema } from '../nodes/registry';
import { usePermStore } from '../store/permissions';
import { toast } from '../ui';
import { addAssetInputFromPicker } from './asset-drop';
import { useCanvasUI } from './ui-state';
import AgentPanel from './agent-panel/AgentPanel';
import BottomPill from './bottom-pill/BottomPill';
import CanvasView from './CanvasView';
import { useCanvasStore } from './canvas-state';
import NodeContextMenu, { type ContextMenuState } from './context-menu/NodeContextMenu';
import PaneContextMenu, { type PaneMenuState } from './context-menu/PaneContextMenu';
import CanvasDock from './dock/CanvasDock';
import TopBar, { type CanvasView as ViewMode } from './chrome/TopBar';
import HistoryDrawer from './history/HistoryDrawer';
import ListView from './list-view/ListView';
// TEMP: restore with detailOpen / openDetail / onEdit / onExpand — do NOT delete.
// import NodeDetailPanel from './node-detail/NodeDetailPanel';
import NodeInlineForm from './node-inline-form/NodeInlineForm';
import NodeToolbar from './node-toolbar/NodeToolbar';
import QueueDrawer from './queue-view/QueueDrawer';
import ResourceDrawer from './resource-drawer/ResourceDrawer';
import StoryboardTableView from './table-view/StoryboardTableView';
import { useCanvasSync } from './sync/useCanvasSync';
import { useCanvasTaskResume } from './hooks/useNodeRunner';

export default function CanvasPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [view, setView] = useState<ViewMode>('canvas');
  const [projectName, setProjectName] = useState<string>('');
  const [historyOpen, setHistoryOpen] = useState(false);
  // TEMP: NodeDetailPanel parked — do NOT delete. Restore with openDetail wiring below.
  // const [detailOpen, setDetailOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [paneMenu, setPaneMenu] = useState<PaneMenuState | null>(null);
  const hydrate = useCanvasStore((s) => s.hydrate);
  useCanvasSync();
  useCanvasTaskResume(projectId);

  // Component-level gate: load this project's capabilities and mirror node-edit
  // into the canvas UI store so every editing control can read one flag.
  const loadProject = usePermStore((s) => s.loadProject);
  const canEdit = usePermStore((s) =>
    projectId ? (s.projectCaps[projectId] ?? s.systemCaps).has('project.canvas.node.edit') : false,
  );
  const canRename = usePermStore((s) =>
    projectId ? (s.projectCaps[projectId] ?? s.systemCaps).has('project.settings.manage') : false,
  );
  useEffect(() => {
    if (projectId) loadProject(projectId);
  }, [projectId, loadProject]);
  useEffect(() => {
    useCanvasUI.getState().setCanEdit(canEdit);
  }, [canEdit]);

  const reload = async () => {
    if (!projectId) return;
    // Server is the source of truth: forward edits persist eagerly and undo/redo
    // reconcile via the replace endpoint, so a plain server load is authoritative.
    const [payload, p] = await Promise.all([canvasApi.full(projectId), projectApi.detail(projectId)]);
    hydrate(payload);
    setProjectName(p.name);
  };

  useEffect(() => {
    reload();
    return () => {
      // Reset store when leaving so going back to a different project starts clean.
      useCanvasStore.setState({ loaded: false, nodes: [], edges: [], selectedNodeId: null });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Snapshot every 30s.
  useEffect(() => {
    if (!projectId) return;
    const t = setInterval(() => {
      // Periodic backup — failures shouldn't toast (noisy), but must not be silent.
      canvasApi.createSnapshot(projectId).catch((e) => console.error('[snapshot] periodic failed', e));
    }, 30_000);
    return () => clearInterval(t);
  }, [projectId]);

  // TEMP: NodeDetailPanel (node-detail-backdrop) parked — do NOT delete.
  // Restore:
  //   const openDetail = useCallback(() => setDetailOpen(true), []);
  //   const closeDetail = useCallback(() => setDetailOpen(false), []);
  //   <NodeToolbar onEdit={openDetail} />
  //   <NodeInlineForm onExpand={openDetail} />
  //   <NodeDetailPanel projectId={projectId} open={detailOpen} onClose={closeDetail} />

  const dragging = useCanvasUI((s) => s.dragging);

  const renameProject = useCallback(
    async (name: string) => {
      if (!projectId) return;
      try {
        const updated = await projectApi.update(projectId, { name });
        setProjectName(updated.name);
      } catch (e) {
        toast.error((e as Error).message || '重命名失败');
        throw e;
      }
    },
    [projectId],
  );

  if (!projectId) return null;

  return (
    <div className="canvas-shell">
      {!dragging ? (
        <TopBar
          projectName={projectName}
          view={view}
          onViewChange={setView}
          onOpenQueue={() => setQueueOpen(true)}
          canRename={canRename}
          onRename={renameProject}
        />
      ) : null}
      {!canEdit ? (
        <div
          role="status"
          style={{
            position: 'absolute',
            top: 52,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            padding: '6px 14px',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--c-text-2, #cbd2e0)',
            background: 'var(--c-canvas-panel, rgba(20,22,28,0.92))',
            border: '1px solid var(--c-canvas-border-soft, rgba(255,255,255,0.12))',
          }}
        >
          只读模式 · 你没有该项目的编辑权限,可查看但不能修改
        </div>
      ) : null}
      {view === 'canvas' ? (
        <ReactFlowProvider>
          <CanvasView
            projectId={projectId}
            onNodeContextMenu={(id, x, y) => setCtxMenu({ nodeId: id, x, y })}
            onPaneMenu={(x, y, flow) => setPaneMenu({ x, y, flow })}
            onOpenResources={() => setResourcesOpen(true)}
          />
          {!dragging ? (
            <CanvasDock
              projectId={projectId}
              onAddNode={(type) => addNodeAt(projectId, type)}
              agentOpen={agentOpen}
              onToggleAgent={() => setAgentOpen((o) => !o)}
            />
          ) : null}
          {!dragging ? <NodeToolbar projectId={projectId} /> : null}
          {!dragging ? <NodeInlineForm projectId={projectId} /> : null}
          {agentOpen ? <AgentPanel projectId={projectId} /> : null}
          <NodeContextMenu projectId={projectId} menu={ctxMenu} onClose={() => setCtxMenu(null)} />
          <PaneContextMenu
            menu={paneMenu}
            onClose={() => setPaneMenu(null)}
            onAdd={(type, flow) => addNodeAt(projectId, type, flow)}
          />
          {/* TEMP: node-detail-backdrop parked — do NOT delete.
          <NodeDetailPanel projectId={projectId} open={detailOpen} onClose={closeDetail} />
          */}
        </ReactFlowProvider>
      ) : null}
      {view === 'list' ? (
        <div className="canvas-shell__view">
          <ListView />
          <BottomPill projectId={projectId} />
        </div>
      ) : null}
      {view === 'storyboard' ? (
        <div className="canvas-shell__view">
          <StoryboardTableView projectId={projectId} />
          <BottomPill projectId={projectId} />
        </div>
      ) : null}
      <QueueDrawer projectId={projectId} open={queueOpen} onClose={() => setQueueOpen(false)} />
      <HistoryDrawer
        projectId={projectId}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestored={reload}
      />
      <ResourceDrawer projectId={projectId} open={resourcesOpen} onClose={() => setResourcesOpen(false)} />
    </div>
  );
}

async function addNodeAt(projectId: string, type: string, position?: { x: number; y: number }) {
  if (!useCanvasUI.getState().canEdit) {
    toast.error('只读模式:你没有编辑权限');
    return;
  }
  const flowPos = position ?? { x: 280 + Math.random() * 200, y: 200 + Math.random() * 200 };
  // Upload-material: open the system picker immediately; cancel creates nothing.
  if (type === 'asset_input') {
    await addAssetInputFromPicker(projectId, flowPos);
    return;
  }
  const schema = getSchema(type);
  if (!schema) return;
  const created = await canvasApi.createNode(projectId, {
    type,
    position: flowPos,
    data: schema.defaultData as never,
  });
  useCanvasStore.getState().setNodes((prev) => [
    ...prev,
    { id: created.id, type: created.type, position: created.position, data: created.data as never },
  ]);
}
