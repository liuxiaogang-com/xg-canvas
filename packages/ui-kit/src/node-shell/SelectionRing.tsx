import type { ReactNode } from 'react';

interface Props {
  selected: boolean;
  children: ReactNode;
  /** Border-radius of the wrapped media area. Defaults to var(--r-lg). */
  radius?: string;
}

export function SelectionRing({ selected, children, radius = 'var(--r-lg)' }: Props) {
  return (
    <div
      style={{
        borderRadius: radius,
        outline: selected ? '1.5px solid var(--c-cyan)' : 'none',
        outlineOffset: '0px',
        boxShadow: selected ? 'var(--shadow-glow-cyan)' : undefined,
        transition: 'box-shadow 120ms ease, outline-color 120ms ease',
      }}
    >
      {children}
    </div>
  );
}
