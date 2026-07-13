import type { IOType } from '@xgcanvas/shared-types';

import { colorForIO } from './port-colors';

interface Props {
  id: string;
  type: IOType;
  label?: string;
}

export function OutputPort({ type, label }: Props) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--c-text-on-dark-3)' }}>
      {label ?? type}
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ background: colorForIO(type), boxShadow: `0 0 6px ${colorForIO(type)}55` }}
      />
    </span>
  );
}
