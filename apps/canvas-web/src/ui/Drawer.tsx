import { useEffect, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  side?: 'left' | 'right';
  width?: number;
  footer?: ReactNode;
  children: ReactNode;
}

export function Drawer({ open, onClose, title, side = 'right', width = 420, footer, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside
        className={`drawer drawer--${side}`}
        style={{ width }}
        role="dialog"
        aria-modal="true"
      >
        {title !== undefined && (
          <header className="drawer__head">
            <h3 className="drawer__title">{title}</h3>
            <button type="button" className="drawer__close" onClick={onClose} aria-label="关闭">
              ✕
            </button>
          </header>
        )}
        <div className="drawer__body">{children}</div>
        {footer && <footer className="drawer__foot">{footer}</footer>}
      </aside>
    </>
  );
}
