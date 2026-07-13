import { useEffect } from 'react';

import { canvasApi } from '../../api/canvas';
import { toast } from '../../ui';
import { useCanvasStore } from '../canvas-state';
import { useCanvasUI } from '../ui-state';
import './NodeContextMenu.css';

export interface ContextMenuState {
  nodeId: string;
  x: number;
  y: number;
}

interface Props {
  projectId: string;
  menu: ContextMenuState | null;
  onClose(): void;
}

/** Right-click node menu: duplicate / save-to-assets / delete (LibTV-style). */
export default function NodeContextMenu({ projectId, menu, onClose }: Props) {
  useEffect(() => {
    if (!menu) return;
    let armed = false;
    const raf = requestAnimationFrame(() => {
      armed = true;
    });
    const close = () => {
      if (armed) onClose();
    };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const duplicate = async () => {
    const node = useCanvasStore.getState().nodes.find((n) => n.id === menu.nodeId);
    if (!node) return;
    const { status: _s, task_id: _t, ...data } = node.data;
    try {
      const created = await canvasApi.createNode(projectId, {
        type: node.type ?? '',
        position: { x: node.position.x + 48, y: node.position.y + 48 },
        data: data as never,
      });
      useCanvasStore.getState().setNodes((prev) => [
        ...prev,
        { id: created.id, type: created.type, position: created.position, data: created.data as never },
      ]);
      useCanvasStore.getState().setSelected(created.id);
    } catch (e) {
      toast.error((e as Error).message);
    }
    onClose();
  };

  const remove = async () => {
    // Pessimistic: only drop from the store after the server confirms, else a
    // failed delete would vanish locally but resurrect on refresh.
    try {
      await canvasApi.removeNode(projectId, menu.nodeId);
    } catch (e) {
      toast.error((e as Error).message || '删除失败');
      onClose();
      return;
    }
    useCanvasStore.getState().setNodes((prev) => prev.filter((n) => n.id !== menu.nodeId));
    useCanvasStore
      .getState()
      .setEdges((prev) => prev.filter((e) => e.source !== menu.nodeId && e.target !== menu.nodeId));
    useCanvasStore.getState().setSelected(null);
    onClose();
  };

  // Read-only viewers have no node actions, so no menu.
  if (!useCanvasUI.getState().canEdit) return null;
  return (
    <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="ctx-menu__item" onClick={duplicate}>
        创建副本
      </button>
      <div className="ctx-menu__sep" />
      <button type="button" className="ctx-menu__item ctx-menu__item--danger" onClick={remove}>
        删除<span className="ctx-menu__key">⌫</span>
      </button>
    </div>
  );
}
