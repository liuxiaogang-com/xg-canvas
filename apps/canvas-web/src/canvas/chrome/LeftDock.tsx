import { DockGroup } from '@xgcanvas/ui-kit';

import { Popover } from '../../ui';
import { PALETTE } from '../../nodes/registry';

interface Props {
  onAddNode(type: string): void;
}

export default function LeftDock({ onAddNode }: Props) {
  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">
      <DockGroup>
        <Popover
          placement="right"
          trigger={<DockButton aria-label="添加节点">+</DockButton>}
          content={
            <div className="w-[180px]">
              {PALETTE.map((p) => (
                <button
                  key={p.type}
                  onClick={() => onAddNode(p.type)}
                  className="block w-full text-left px-2 py-1.5 rounded text-text-2 hover:bg-canvas-panel-2 text-sm"
                >
                  {p.title}
                </button>
              ))}
            </div>
          }
        />
        <DockButton aria-label="历史(M3 末)">⌚</DockButton>
        <DockButton aria-label="资产库">⌘</DockButton>
      </DockGroup>
    </div>
  );
}

function DockButton({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="w-9 h-9 rounded-full flex items-center justify-center text-text-2 hover:text-text-1 hover:bg-canvas-panel-2 transition"
    >
      {children}
    </button>
  );
}
