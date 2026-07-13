import { NodeResizer, type NodeProps } from '@xyflow/react';
import { useState } from 'react';

import { useCanvasStore } from '../../canvas/canvas-state';
import { scheduleNodeUpdate } from '../../canvas/sync/auto-save';
import { renameNode } from '../_shared/rename';

/** Outer container that visually wraps a group of nodes. Sized via node.style
 *  (set when grouping); React Flow moves its children when it is dragged.
 *  Resizable when selected (size persisted to data.width/height), and the label
 *  is double-click editable (persisted via renameNode). */
export default function GroupNode({ id, data, selected }: NodeProps) {
  const label = (data as { label?: string }).label ?? '分组';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEdit = () => {
    setDraft(label);
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== label) renameNode(id, next, 'label');
  };

  const persistSize = (width: number, height: number) => {
    const w = Math.round(width);
    const h = Math.round(height);
    const pid = useCanvasStore.getState().projectId;
    useCanvasStore.getState().patchNodeData(id, { width: w, height: h } as never);
    if (pid) scheduleNodeUpdate(pid, id, { data: { width: w, height: h } });
  };

  return (
    <div className={`groupnode${selected ? ' groupnode--selected' : ''}`}>
      <NodeResizer
        isVisible={selected}
        minWidth={140}
        minHeight={90}
        onResizeEnd={(_e, p) => persistSize(p.width, p.height)}
      />
      {editing ? (
        <input
          className="groupnode__label-input nodrag"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              setEditing(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="groupnode__label" onDoubleClick={startEdit} title="双击重命名">
          {label}
        </span>
      )}
    </div>
  );
}
