import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  trigger: ReactNode;
  content: ReactNode;
  placement?: 'bottom' | 'top' | 'right' | 'left';
  offset?: number;
}

/** Click-anchored popover; closes on outside click or Escape. */
export function Popover({ trigger, content, placement = 'bottom', offset = 6 }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const popStyle: React.CSSProperties = (() => {
    switch (placement) {
      case 'top':    return { bottom: `calc(100% + ${offset}px)`, left: 0 };
      case 'right':  return { left: `calc(100% + ${offset}px)`, top: 0 };
      case 'left':   return { right: `calc(100% + ${offset}px)`, top: 0 };
      default:       return { top: `calc(100% + ${offset}px)`, left: 0 };
    }
  })();

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <span onClick={() => setOpen((v) => !v)} style={{ display: 'inline-flex' }}>
        {trigger}
      </span>
      {open && (
        <div className="popover" style={popStyle} onClick={() => setOpen(false)}>
          {content}
        </div>
      )}
    </span>
  );
}
