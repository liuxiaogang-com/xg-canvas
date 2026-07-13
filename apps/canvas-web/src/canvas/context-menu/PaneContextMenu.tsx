import { useEffect } from 'react';

import { PALETTE } from '../../nodes/registry';
import { NodeIcon } from '../../nodes/node-icons';
import './NodeContextMenu.css';

export interface PaneMenuState {
  x: number;
  y: number;
  flow: { x: number; y: number };
}

interface Props {
  menu: PaneMenuState | null;
  onClose(): void;
  onAdd(type: string, flow: { x: number; y: number }): void;
}

/** Blank-canvas menu (right-click / double-click): add a node at the cursor. */
export default function PaneContextMenu({ menu, onClose, onAdd }: Props) {
  useEffect(() => {
    if (!menu) return;
    // Arm one frame later so the opening right-click (and the window `blur` a
    // real right-click triggers on Windows) can't immediately close the menu.
    // No `blur` listener — it was closing the menu the instant it opened.
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

  return (
    <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
      <div style={{ padding: '6px 12px 4px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>添加节点</div>
      {PALETTE.map((p) => (
        <button
          key={p.type}
          type="button"
          className="ctx-menu__item"
          onClick={() => {
            onAdd(p.type, menu.flow);
            onClose();
          }}
        >
          <span className="ctx-menu__icon">
            <NodeIcon type={p.type} />
          </span>
          {p.title}
        </button>
      ))}
    </div>
  );
}
