import type { ReactNode, CSSProperties } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function GlassPill({ children, className = '', style }: Props) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full ${className}`}
      style={{
        background: 'var(--c-glass)',
        border: '1px solid var(--c-glass-stroke)',
        backdropFilter: 'blur(12px)',
        boxShadow: 'var(--shadow-md)',
        padding: '8px 12px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
