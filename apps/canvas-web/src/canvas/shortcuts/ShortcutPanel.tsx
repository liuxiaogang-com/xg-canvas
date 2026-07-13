import { useEffect, useState } from 'react';

import { SHORTCUTS, comboFromEvent, comboLabel, type ShortcutId } from './keymap';
import { useShortcutStore } from './shortcut-store';
import './shortcuts.css';

const CATS = ['创建', '编辑', '视图'] as const;

export default function ShortcutPanel({ onClose }: { onClose(): void }) {
  const custom = useShortcutStore((s) => s.custom);
  const keysFor = useShortcutStore((s) => s.keysFor);
  const rebind = useShortcutStore((s) => s.rebind);
  const reset = useShortcutStore((s) => s.reset);
  const [recording, setRecording] = useState<ShortcutId | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !recording) onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose, recording]);

  // record mode: capture the next real combo (capture phase, before the dispatcher)
  useEffect(() => {
    if (!recording) return;
    const h = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRecording(null);
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo) return; // a bare modifier — keep waiting
      rebind(recording, combo);
      setRecording(null);
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [recording, rebind]);

  return (
    <div className="sc-overlay" onClick={onClose}>
      <div className="sc-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sc-panel__head">
          <h3 className="sc-panel__title">快捷键</h3>
          <button type="button" className="sc-close" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="sc-panel__body">
          {CATS.map((cat) => (
            <div key={cat} className="sc-group">
              <div className="sc-group__title">{cat}</div>
              {SHORTCUTS.filter((s) => s.category === cat).map((s) => (
                <div key={s.id} className="sc-row">
                  <span className="sc-row__label">{s.label}</span>
                  <div className="sc-row__keys">
                    <button
                      type="button"
                      className={`sc-key${recording === s.id ? ' sc-key--rec' : ''}`}
                      onClick={() => setRecording(s.id)}
                    >
                      {recording === s.id ? '按下新快捷键…' : comboLabel(keysFor(s.id))}
                    </button>
                    {custom[s.id] !== undefined ? (
                      <button type="button" className="sc-reset" title="恢复默认" onClick={() => reset(s.id)}>
                        默认
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="sc-panel__foot">点击右侧按键可重新录制;录制时按 Esc 取消。新增的功能会自动出现在这里。</div>
      </div>
    </div>
  );
}
