import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  orientation?: 'horizontal' | 'vertical';
}

export function DockGroup({ children, orientation = 'vertical' }: Props) {
  return (
    <div
      className={`inline-flex ${orientation === 'vertical' ? 'flex-col' : 'flex-row'} rounded-full p-1 gap-1`}
      style={{
        background: 'var(--c-glass)',
        border: '1px solid var(--c-glass-stroke)',
        backdropFilter: 'blur(12px)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {children}
    </div>
  );
}
