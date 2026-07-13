import { useEffect } from 'react';

import { getSchema } from '../../nodes/registry';
import { NodeIcon } from '../../nodes/node-icons';
import './NodeContextMenu.css';

export interface ConnectMenuState {
  x: number;
  y: number;
  flow: { x: number; y: number };
  fromId: string;
  /** 'out' = dragged from an output (create downstream); 'in' = from an input (create upstream). */
  dir: 'in' | 'out';
  types: string[];
}

interface Props {
  menu: ConnectMenuState | null;
  onClose(): void;
  onPick(type: string): void;
}

/** Menu shown when a connection is dropped on empty canvas: pick a compatible
 *  node type to create and auto-connect. */
export default function ConnectMenu({ menu, onClose, onPick }: Props) {
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

  return (
    <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
      <div style={{ padding: '6px 12px 4px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
        {menu.dir === 'out' ? '连接到新节点' : '从新节点接入'}
      </div>
      {menu.types.map((t) => (
        <button
          key={t}
          type="button"
          className="ctx-menu__item"
          onClick={() => {
            onPick(t);
            onClose();
          }}
        >
          <span className="ctx-menu__icon">
            <NodeIcon type={t} />
          </span>
          {getSchema(t)?.title ?? t}
        </button>
      ))}
    </div>
  );
}
