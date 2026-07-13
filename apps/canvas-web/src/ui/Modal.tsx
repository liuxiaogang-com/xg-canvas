import { useEffect, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  width?: number;
  footer?: ReactNode;
  children: ReactNode;
}

export function Modal({ open, onClose, title, width = 420, footer, children }: Props) {
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
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        {title !== undefined && <h2 className="dialog__title">{title}</h2>}
        <div className="dialog__body">{children}</div>
        {footer && <div className="dialog__actions">{footer}</div>}
      </div>
    </div>
  );
}
