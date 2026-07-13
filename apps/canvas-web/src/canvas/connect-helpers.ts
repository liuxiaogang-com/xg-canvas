import { isConnectionAllowed } from '@xgcanvas/shared-types';
import { colorForIO } from '@xgcanvas/ui-kit';

import { NODE_REGISTRY, isPaletteType } from '../nodes/registry';
import type { PortType } from '../nodes/port-lookup';

/** Map an edge's data_type to its typed port color. */
export function edgeColor(dataType?: string): string {
  const base = (dataType ?? '').split(':')[0];
  if (!base) return 'rgba(255,255,255,0.22)';
  try {
    return colorForIO(base as never) || 'rgba(255,255,255,0.22)';
  } catch {
    return 'rgba(255,255,255,0.22)';
  }
}

function allowed(a: PortType, b: PortType): boolean {
  return isConnectionAllowed(
    { io: a.type as never, entityKind: a.entityKind as never },
    { io: b.type as never, entityKind: b.entityKind as never },
  );
}

/** Node types whose input accepts `srcOut` — i.e. valid downstream nodes when
 *  dragging from an output handle. Only palette-visible types are offered. */
export function createTargetTypes(srcOut: PortType): string[] {
  return Object.values(NODE_REGISTRY)
    .filter((e) => isPaletteType(e.schema.type))
    .filter((e) => (e.schema.inputs ?? []).some((i: PortType) => allowed(srcOut, i)))
    .map((e) => e.schema.type);
}

/** Node types whose output is accepted by any of `targetInputs` — i.e. valid
 *  upstream nodes when dragging from an input handle. Only palette-visible types. */
export function createSourceTypes(targetInputs: PortType[]): string[] {
  return Object.values(NODE_REGISTRY)
    .filter((e) => isPaletteType(e.schema.type))
    .filter((e) => {
      const out = e.schema.outputs?.[0] as PortType | undefined;
      return !!out && targetInputs.some((i) => allowed(out, i));
    })
    .map((e) => e.schema.type);
}
