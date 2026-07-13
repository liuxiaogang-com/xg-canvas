import type { ReactNode } from 'react';

interface Props {
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Floating chip used as node title / status / context badges. */
export function ChipLabel({ icon, children, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-[10px] py-1 rounded-full text-[11px] leading-none ${className}`}
      style={{
        background: 'var(--c-glass)',
        border: '1px solid var(--c-glass-stroke)',
        backdropFilter: 'blur(12px)',
        color: 'var(--c-text-on-dark-2)',
      }}
    >
      {icon ? <span aria-hidden>{icon}</span> : null}
      {children}
    </span>
  );
}
