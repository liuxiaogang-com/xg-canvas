import type { ReactNode } from 'react';

import { ChipLabel } from './ChipLabel';

export type NodeStatus = 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

const DOT_COLOR: Record<NodeStatus, string> = {
  idle: 'var(--c-text-on-dark-3)',
  queued: 'var(--c-info)',
  running: 'var(--c-cyan)',
  succeeded: 'var(--c-success)',
  failed: 'var(--c-danger)',
  cancelled: 'var(--c-text-on-dark-3)',
};

interface Props {
  status: NodeStatus;
  children: ReactNode;
}

export function StatusChip({ status, children }: Props) {
  return (
    <ChipLabel
      icon={
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{
            background: DOT_COLOR[status],
            boxShadow: status === 'running' ? `0 0 6px ${DOT_COLOR[status]}` : undefined,
          }}
        />
      }
    >
      {children}
    </ChipLabel>
  );
}
