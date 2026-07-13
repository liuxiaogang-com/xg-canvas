/** "16:9" -> "16 / 9" for CSS aspect-ratio; falls back to square. */
export function aspectCss(ratio: string | undefined | null): string {
  if (!ratio) return '1 / 1';
  const [w, h] = ratio.split(':');
  return w && h ? `${w} / ${h}` : '1 / 1';
}

/** CSS aspect-ratio from intrinsic pixel size. */
export function aspectFromSize(width?: number | null, height?: number | null): string | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  return `${width} / ${height}`;
}

/**
 * Prefer the live model param field `ratio` (Dreamina etc.) over the legacy
 * node-schema field `aspect_ratio`.
 */
export function resolveAspectRatio(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  const r = data.ratio ?? data.aspect_ratio;
  return typeof r === 'string' && r.includes(':') ? r : null;
}
