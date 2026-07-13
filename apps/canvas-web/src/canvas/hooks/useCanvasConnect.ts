import { useCallback, useState } from 'react';
import {
  addEdge,
  useReactFlow,
  type Connection,
  type FinalConnectionState,
  type Node,
} from '@xyflow/react';

import { canvasApi } from '../../api/canvas';
import type { CanvasNodeData } from '../../nodes/types';
import { acceptedInputsOf, outputTypeOf } from '../../nodes/port-lookup';
import { getSchema } from '../../nodes/registry';
import { toast } from '../../ui';
import { useCanvasStore } from '../canvas-state';
import { createSourceTypes, createTargetTypes } from '../connect-helpers';
import type { ConnectMenuState } from '../context-menu/ConnectMenu';

/** Connection behaviour: completing a real connection persists an edge;
 *  dropping on empty canvas opens a compatible-node menu (create + connect). */
export function useCanvasConnect(projectId: string) {
  const { screenToFlowPosition } = useReactFlow();
  const setNodes = useCanvasStore((s) => s.setNodes);
  const setEdges = useCanvasStore((s) => s.setEdges);
  const setSelected = useCanvasStore((s) => s.setSelected);
  const [connectMenu, setConnectMenu] = useState<ConnectMenuState | null>(null);

  const onConnect = useCallback(
    async (c: Connection) => {
      const src = useCanvasStore.getState().nodes.find((n) => n.id === c.source);
      const so = src ? outputTypeOf(src) : null;
      if (!so) return;
      const dataType = so.entityKind ? `entity_ref:${so.entityKind}` : so.type;
      try {
        const saved = await canvasApi.createEdge(projectId, {
          source_node_id: c.source!,
          source_handle: c.sourceHandle ?? 'out',
          target_node_id: c.target!,
          target_handle: c.targetHandle ?? 'in',
          data_type: dataType,
        });
        setEdges((prev) =>
          addEdge(
            {
              id: saved.id,
              source: saved.source_node_id,
              target: saved.target_node_id,
              sourceHandle: saved.source_handle,
              targetHandle: saved.target_handle,
              data: { data_type: saved.data_type },
            },
            prev,
          ),
        );
      } catch (e) {
        // server rejected (incompatible types / duplicate edge) — the optimistic
        // edge is never added, so just tell the user why it didn't connect.
        toast.error((e as Error).message || '连线失败');
      }
    },
    [projectId, setEdges],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      // a real / on-node connection is handled by onConnect; only act on drops to empty canvas
      if (state.isValid || state.toNode) return;
      const fromNode = state.fromNode;
      const fromHandle = state.fromHandle;
      if (!fromNode || !fromHandle) return;
      const clientX = 'clientX' in event ? event.clientX : event.changedTouches[0].clientX;
      const clientY = 'clientY' in event ? event.clientY : event.changedTouches[0].clientY;
      const node = fromNode as unknown as Node<CanvasNodeData>;
      let types: string[] = [];
      let dir: 'in' | 'out';
      if (fromHandle.type === 'source') {
        const so = outputTypeOf(node);
        if (!so) return;
        types = createTargetTypes(so);
        dir = 'out';
      } else {
        const inputs = acceptedInputsOf(node);
        if (!inputs.length) return;
        types = createSourceTypes(inputs);
        dir = 'in';
      }
      if (!types.length) return;
      setConnectMenu({ x: clientX, y: clientY, flow: screenToFlowPosition({ x: clientX, y: clientY }), fromId: fromNode.id, dir, types });
    },
    [screenToFlowPosition],
  );

  const createConnected = useCallback(
    async (type: string) => {
      const menu = connectMenu;
      const schema = menu ? getSchema(type) : null;
      if (!menu || !schema) return;
      try {
        const created = await canvasApi.createNode(projectId, { type, position: menu.flow, data: schema.defaultData as never });
        setNodes((prev) => [
          ...prev.map((n) => (n.selected ? { ...n, selected: false } : n)),
          { id: created.id, type: created.type, position: created.position, data: created.data as never, selected: true },
        ]);
        const [sourceId, targetId] = menu.dir === 'out' ? [menu.fromId, created.id] : [created.id, menu.fromId];
        const sourceNode = useCanvasStore.getState().nodes.find((n) => n.id === sourceId);
        const so = sourceNode ? outputTypeOf(sourceNode) : null;
        const dataType = so ? (so.entityKind ? `entity_ref:${so.entityKind}` : so.type) : '';
        const saved = await canvasApi.createEdge(projectId, {
          source_node_id: sourceId,
          source_handle: 'out',
          target_node_id: targetId,
          target_handle: 'in',
          data_type: dataType,
        });
        setEdges((prev) =>
          addEdge(
            { id: saved.id, source: sourceId, target: targetId, sourceHandle: 'out', targetHandle: 'in', data: { data_type: saved.data_type } },
            prev,
          ),
        );
        setSelected(created.id);
      } catch (e) {
        toast.error((e as Error).message || '创建并连线失败');
      }
    },
    [projectId, connectMenu, setNodes, setEdges, setSelected],
  );

  return { onConnect, onConnectEnd, connectMenu, setConnectMenu, createConnected };
}
