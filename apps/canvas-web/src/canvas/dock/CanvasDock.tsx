import { useReactFlow } from '@xyflow/react';

import { canvasApi } from '../../api/canvas';
import { PALETTE } from '../../nodes/registry';
import { Popover, toast } from '../../ui';
import ShortcutButton from '../shortcuts/ShortcutButton';
import { useCanvasUI } from '../ui-state';
import './CanvasDock.css';

interface Props {
  projectId: string;
  onAddNode(type: string): void;
  agentOpen: boolean;
  onToggleAgent(): void;
}

/** Bottom-center dock (LibTV pill): add-node palette + global canvas actions.
 *  Params no longer live here — they moved into the per-node inline form. */
export default function CanvasDock({ projectId, onAddNode, agentOpen, onToggleAgent }: Props) {
  const { fitView } = useReactFlow();
  const pointerMode = useCanvasUI((s) => s.pointerMode);
  const setPointerMode = useCanvasUI((s) => s.setPointerMode);
  const canEdit = useCanvasUI((s) => s.canEdit);

  return (
    <div className="canvas-dock">
      {canEdit ? (
        <Popover
          placement="top"
          trigger={
            <button type="button" className="cdock__add" aria-label="添加节点" title="添加节点">
              <Icon path="M12 5v14M5 12h14" />
            </button>
          }
          content={
            <div className="cdock__palette">
              <div className="cdock__palette-title">添加节点</div>
              {PALETTE.map((p) => (
                <button key={p.type} type="button" className="cdock__palette-item" onClick={() => onAddNode(p.type)}>
                  {p.title}
                </button>
              ))}
            </div>
          }
        />
      ) : null}
      <span className="cdock__sep" />
      <button
        type="button"
        className={`cdock__btn${pointerMode === 'select' ? ' cdock__btn--on' : ''}`}
        title={
          pointerMode === 'move'
            ? '指针：拖动平移 · 滚轮缩放（点此切换为框选）'
            : '指针：左键框选 · 滚轮平移 · Alt+滚轮缩放（点此切换为移动）'
        }
        onClick={() => setPointerMode(pointerMode === 'move' ? 'select' : 'move')}
      >
        {pointerMode === 'move' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m5 3 5 14 2-5.2 5.2-2z" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" strokeDasharray="3 3" />
          </svg>
        )}
      </button>
      <button type="button" className="cdock__btn" title="适配视图" onClick={() => fitView({ duration: 300, padding: 0.2 })}>
        <Icon path="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      </button>
      <button
        type="button"
        className="cdock__btn"
        title="保存快照"
        onClick={() =>
          canvasApi
            .createSnapshot(projectId)
            .then(() => toast.success('已保存快照'))
            .catch((e) => toast.error((e as Error).message || '保存快照失败'))
        }
      >
        <Icon path="M5 3h11l3 3v15H5zM9 3v5h7" />
      </button>
      <button
        type="button"
        className={`cdock__btn${agentOpen ? ' cdock__btn--on' : ''}`}
        title="AI 助手"
        onClick={onToggleAgent}
      >
        <Icon path="M12 3a7 7 0 0 1 7 7c0 3-2 5-2 7H7c0-2-2-4-2-7a7 7 0 0 1 7-7zM9 21h6" />
      </button>
      <ShortcutButton />
    </div>
  );
}

function Icon({ path }: { path: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={path} />
    </svg>
  );
}
