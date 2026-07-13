import type { IOType } from '@xgcanvas/shared-types';

import { colorForIO } from './port-colors';

interface Props {
  id: string;
  type: IOType;
  label?: string;
  required?: boolean;
}

/**
 * Visual stub for a node input port. The actual react-flow Handle is
 * rendered by the host; this component only renders the dot + label
 * so node files in apps/canvas-web stay schema-driven.
 */
export function InputPort({ type, label, required }: Props) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--c-text-on-dark-3)' }}>
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ background: colorForIO(type), boxShadow: `0 0 6px ${colorForIO(type)}55` }}
      />
      {label ?? type}
      {required ? <span style={{ color: 'var(--c-danger)' }}>*</span> : null}
    </span>
  );
}
