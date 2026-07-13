import type { ReactNode, CSSProperties } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function GlassPanel({ children, className = '', style }: Props) {
  return (
    <div
      className={`rounded-2xl ${className}`}
      style={{
        background: 'var(--c-glass)',
        border: '1px solid var(--c-glass-stroke)',
        backdropFilter: 'blur(12px)',
        boxShadow: 'var(--shadow-md)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
