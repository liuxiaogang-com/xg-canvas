import type { IOType } from '@xgcanvas/shared-types';

/**
 * IO type → CSS variable. Resolved at render time so theme switches work.
 */
export const PORT_COLOR_VAR: Record<IOType, string> = {
  text: 'var(--c-port-text)',
  image: 'var(--c-port-image)',
  image_list: 'var(--c-port-image-list)',
  grid: 'var(--c-port-grid)',
  video: 'var(--c-port-video)',
  audio: 'var(--c-port-audio)',
  json: 'var(--c-port-json)',
  reference: 'var(--c-port-reference)',
  mask: 'var(--c-port-mask)',
  style_token: 'var(--c-port-style)',
  entity_ref: 'var(--c-port-entity)',
  library_ref: 'var(--c-port-library)',
};

export function colorForIO(io: IOType): string {
  return PORT_COLOR_VAR[io];
}
