import { Handle, Position } from '@xyflow/react';

/**
 * One connection point per side (left = input, right = output), styled as a
 * large hover-revealed "+" button (TapNow-style). A single handle fans out to
 * many edges. Dragging from a "+" onto empty canvas opens a compatible-node
 * menu (see CanvasView.onConnectEnd).
 */
function Plus() {
  return (
    <svg className="node-port__plus" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export default function NodePorts() {
  return (
    <>
      <Handle id="in" type="target" position={Position.Left} className="node-port node-port--in">
        <Plus />
      </Handle>
      <Handle id="out" type="source" position={Position.Right} className="node-port node-port--out">
        <Plus />
      </Handle>
    </>
  );
}
